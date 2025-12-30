/**
 * Profile Validation Edge Function
 * 
 * This function validates a user's entire profile after all photos are submitted.
 * It should be triggered after startValidation() is called (when user clicks "Start Exploring").
 * 
 * It checks:
 * - Minimum photo requirements (at least 1 human photo, at least 1 dog photo)
 * - Photo quality/content (already validated by validate-photo function)
 * 
 * Then calls applyValidationResult() with the validation_run_id to update profile status.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request body
    const { user_id, validation_run_id } = await req.json()

    if (!user_id || !validation_run_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, validation_run_id' }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get profile to check validation_run_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('validation_run_id, lifecycle_status, validation_status')
      .eq('user_id', user_id)
      .single()

    if (profileError) {
      console.error(`[validate-profile] Failed to load profile for user ${user_id}:`, profileError)
      return new Response(
        JSON.stringify({ error: 'Failed to load profile' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify this is still the latest validation run
    if (profile.validation_run_id !== validation_run_id) {
      console.warn(
        `[validate-profile] Validation runId mismatch for user ${user_id}. Expected: ${validation_run_id}, Current: ${profile.validation_run_id}`
      )
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'runId_mismatch' }), 
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get all dogs for this user to check photo requirements per dog
    const { data: dogs, error: dogsError } = await supabaseAdmin
      .from('dogs')
      .select('slot')
      .eq('user_id', user_id)
      .eq('is_active', true)

    if (dogsError) {
      console.error(`[validate-profile] Failed to load dogs for user ${user_id}:`, dogsError)
      return new Response(
        JSON.stringify({ error: 'Failed to load dogs' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const dogSlots = dogs?.map((d) => d.slot) || []

    // Get all photos for this user (approved and rejected) to check status
    const { data: allPhotos, error: photosError } = await supabaseAdmin
      .from('photos')
      .select('dog_slot, contains_human, contains_dog, status')
      .eq('user_id', user_id)

    if (photosError) {
      console.error(`[validate-profile] Failed to load photos for user ${user_id}:`, photosError)
      return new Response(
        JSON.stringify({ error: 'Failed to load photos' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Filter approved photos
    const approvedPhotos = allPhotos?.filter((p) => p.status === 'approved') || []
    
    // Check if there are any rejected photos
    const hasRejectedPhotos = allPhotos?.some((p) => p.status === 'rejected') || false

    // Count approved human photos (dog_slot IS NULL AND contains_human=true)
    const approvedHumanPhotos = approvedPhotos.filter(
      (p) => p.dog_slot === null && p.contains_human === true
    ).length

    // Check if each dog has at least one approved photo
    // For each dog slot, check if there's at least one approved dog photo
    const allDogsHavePhotos = dogSlots.length > 0 && dogSlots.every((slot) => {
      return approvedPhotos.some(
        (p) => p.dog_slot === slot && p.contains_dog === true
      )
    })

    // Determine if minimum requirements are met
    const minimumRequirementsMet = approvedHumanPhotos >= 1 && allDogsHavePhotos

    // Determine final status
    let lifecycleStatus: 'active' | 'limited' | 'pending_review'
    let validationStatus: 'passed' | 'failed_photos' | 'failed_requirements'

    if (minimumRequirementsMet && !hasRejectedPhotos) {
      // All requirements met and no rejected photos = passed
      lifecycleStatus = 'active'
      validationStatus = 'passed'
    } else if (minimumRequirementsMet && hasRejectedPhotos) {
      // Minimum requirements met but some photos rejected = failed_photos
      lifecycleStatus = 'limited'
      validationStatus = 'failed_photos'
    } else {
      // Minimum requirements not met = failed_requirements
      lifecycleStatus = 'pending_review'
      validationStatus = 'failed_requirements'
    }

    // Update profile with result (only if runId matches)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        lifecycle_status: lifecycleStatus,
        validation_status: validationStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user_id)
      .eq('validation_run_id', validation_run_id) // CRITICAL: Only update if runId matches

    if (updateError) {
      console.error(`[validate-profile] Failed to update profile for user ${user_id}:`, updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(
      `[validate-profile] Applied validation result for user ${user_id}, runId ${validation_run_id}: ${validationStatus}, lifecycle: ${lifecycleStatus}`
    )

    return new Response(
      JSON.stringify({ 
        status: 'success',
        validation_status: validationStatus,
        lifecycle_status: lifecycleStatus,
        approved_human_photos: approvedHumanPhotos,
        all_dogs_have_photos: allDogsHavePhotos,
        has_rejected_photos: hasRejectedPhotos,
        minimum_requirements_met: minimumRequirementsMet,
        dog_slots: dogSlots,
      }), 
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (err) {
    console.error('[validate-profile] Error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

