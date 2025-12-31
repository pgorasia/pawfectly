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

  // Optional: lock down to internal callers (recommended once the server-driven pipeline is enabled)
  const internalSecret = Deno.env.get('PAWFECTLY_INTERNAL_SECRET')
  if (internalSecret) {
    const provided = req.headers.get('x-pawfectly-secret')
    if (provided !== internalSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    // 1. Parse the webhook payload (triggered by DB INSERT on photos table)
    const payload = await req.json()
    const photo = payload.record || payload
    
    const { id, user_id, storage_path, bucket_type, target_type, status } = photo
    
    if (!id || !storage_path || !bucket_type) {
      console.error('[validate-photo] Missing required fields:', { id, storage_path, bucket_type })
      return new Response(
        JSON.stringify({ error: 'Missing required fields: id, storage_path, bucket_type' }), 
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Fallback: if target_type is missing, set it based on bucket_type
    const effectiveTargetType = target_type || bucket_type
    console.log(`[validate-photo] Processing photo ${id}, bucket_type: ${bucket_type}, target_type: ${effectiveTargetType}, status: ${status}`)

    // 2. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Generate public URL for the uploaded image (bucket is public)
    const { data: urlData } = supabaseAdmin.storage
      .from('photos')
      .getPublicUrl(storage_path)
    
    const publicImageUrl = urlData.publicUrl

    if (!publicImageUrl) {
      console.error(`[validate-photo] Could not generate public URL for photo ${id}`)
      await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'failed_to_generate_url', undefined, user_id)
      return new Response(
        JSON.stringify({ error: 'Could not generate public URL' }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`[validate-photo] Photo ${id}: Generated public URL`)

    // 4. OpenAI Moderation (image) - using omni-moderation-latest
    // Check for NSFW/inappropriate content first. If flagged, reject immediately.
    try {
      const moderationRes = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY_DEV')}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          input: publicImageUrl,  // OpenAI Moderation API accepts image URLs
          model: "omni-moderation-latest"
        })
      })

      if (moderationRes.ok) {
        const moderationData = await moderationRes.json()
        const moderationFlagged = moderationData.results?.[0]?.flagged || false
        console.log(`[validate-photo] Photo ${id}: Moderation result - flagged: ${moderationFlagged}`)

        if (moderationFlagged) {
          console.log(`[validate-photo] Photo ${id}: REJECTED - NSFW or disallowed content detected by Moderation API`)
          await deletePhotoFromStorage(supabaseAdmin, storage_path)
          await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'nsfw_or_disallowed', undefined, user_id)
          return new Response(
            JSON.stringify({ status: 'rejected', reason: 'nsfw_or_disallowed' }), 
            { 
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }
      } else {
        const errorText = await moderationRes.text()
        console.warn(`[validate-photo] OpenAI Moderation API error for photo ${id}:`, errorText)
        // Continue to Vision API which will also check for NSFW as fallback
      }
    } catch (modError) {
      console.warn(`[validate-photo] Photo ${id}: Moderation API exception:`, modError)
      // Continue to Vision API which will also check for NSFW as fallback
    }

    // 5. OpenAI Vision check (only called if moderation didn't flag)
    // Vision API checks for NSFW as fallback + content analysis (hasHuman, hasDog, hasText, isScreenshot)
    const visionPrompt = `Analyze this photo for a pet social app. Return ONLY JSON:
{ "hasHuman": boolean, "hasDog": boolean, "hasText": boolean, "isNSFW": boolean, "isScreenshot": boolean }.

Rules:
- hasHuman: true if there is a human person visible
- hasDog: true if there is a dog visible
- hasText: true if there is ANY contact information visible, including:
  * Phone numbers (any format: (555) 123-4567, 555-123-4567, +1 555 123 4567, etc.)
  * Email addresses (any format: user@example.com, etc.)
  * Social media handles (@username, Instagram handles, Snapchat usernames, TikTok handles)
  * QR codes (any QR code visible in the image)
  * Watermarked usernames (any text watermark with contact info)
  * Any readable text that appears to be contact information
- isNSFW: true if the image contains nudity, explicit sexual content, violence, or any inappropriate/adult content unsuitable for a family-friendly pet app
- isScreenshot: true if the image appears to be a screenshot or UI capture, including:
  * Photos with app UI elements (navigation bars, buttons, menus, app interfaces)
  * Chat screenshots (messaging app interfaces, conversation screens)
  * Camera roll UI (photo gallery interfaces, file browser UI)
  * Any device screen capture showing software interfaces or UI elements

Be strict with NSFW detection: flag anything that would be inappropriate for children or violates content policies.
Be strict with screenshot detection: flag any image that shows device UI, app interfaces, or screen captures.`

    const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY_DEV')}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        model: "gpt-4o",  // Image-capable model
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: visionPrompt },
              { type: "image_url", image_url: { url: publicImageUrl } }
            ]
          }
        ],
        response_format: { type: "json_object" }  // Force JSON response
      })
    })

    if (!visionRes.ok) {
      const errorText = await visionRes.text()
      console.error(`[validate-photo] OpenAI Vision API error for photo ${id}:`, errorText)
      throw new Error(`OpenAI Vision API failed: ${visionRes.status}`)
    }

    const visionData = await visionRes.json()
    const visionContent = visionData.choices?.[0]?.message?.content
    
    if (!visionContent) {
      console.error(`[validate-photo] Photo ${id}: No content in vision response`)
      throw new Error('No content in vision response')
    }

    let visionResult: { hasHuman: boolean; hasDog: boolean; hasText: boolean; isNSFW?: boolean; isScreenshot?: boolean }
    try {
      visionResult = JSON.parse(visionContent)
    } catch (e) {
      console.error(`[validate-photo] Photo ${id}: Failed to parse vision JSON:`, visionContent)
      throw new Error('Failed to parse vision JSON response')
    }

    const { hasHuman = false, hasDog = false, hasText = false, isNSFW = false, isScreenshot = false } = visionResult
    console.log(`[validate-photo] Photo ${id}: Vision result - hasHuman: ${hasHuman}, hasDog: ${hasDog}, hasText: ${hasText}, isNSFW: ${isNSFW}, isScreenshot: ${isScreenshot}`)

    // 6. Apply approval rules

    // Rule: Reject if NSFW detected by Vision API (fallback if moderation API missed it)
    if (isNSFW) {
      console.log(`[validate-photo] Photo ${id}: REJECTED - NSFW or disallowed content detected by Vision API`)
      await deletePhotoFromStorage(supabaseAdmin, storage_path)
      await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'nsfw_or_disallowed', undefined, user_id)
      return new Response(
        JSON.stringify({ status: 'rejected', reason: 'nsfw_or_disallowed' }), 
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Rule: Reject if screenshot/UI capture detected
    if (isScreenshot) {
      console.log(`[validate-photo] Photo ${id}: REJECTED - Screenshot or UI capture detected`)
      await deletePhotoFromStorage(supabaseAdmin, storage_path)
      await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'is_screenshot', undefined, user_id)
      return new Response(
        JSON.stringify({ status: 'rejected', reason: 'is_screenshot' }), 
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Rule: If hasText=true, reject and delete (contact info detection)
    if (hasText) {
      console.log(`[validate-photo] Photo ${id}: REJECTED - Contains contact info`)
      await deletePhotoFromStorage(supabaseAdmin, storage_path)
      await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'contains_contact_info', undefined, user_id)
      return new Response(
        JSON.stringify({ status: 'rejected', reason: 'contains_contact_info' }), 
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Rule: Use target_type to determine what we're looking for
    if (effectiveTargetType === 'human') {
      if (hasHuman) {
        console.log(`[validate-photo] Photo ${id}: APPROVED - Human detected`)
        await updatePhotoStatus(supabaseAdmin, id, 'approved', null, { hasHuman, hasDog, hasText }, user_id)
        return new Response(
          JSON.stringify({ status: 'approved' }), 
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } else if (hasDog && !hasHuman) {
        // Special case: We see a dog but no human
        console.log(`[validate-photo] Photo ${id}: REJECTED - Dog detected but no human (target: human)`)
        await deletePhotoFromStorage(supabaseAdmin, storage_path)
        await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'Dog detected but human is missing', undefined, user_id)
        return new Response(
          JSON.stringify({ status: 'rejected', reason: 'Dog detected but human is missing' }), 
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } else {
        console.log(`[validate-photo] Photo ${id}: REJECTED - Missing human`)
        await deletePhotoFromStorage(supabaseAdmin, storage_path)
        await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'missing_human', undefined, user_id)
        return new Response(
          JSON.stringify({ status: 'rejected', reason: 'missing_human' }), 
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Rule: target_type='dog'
    if (effectiveTargetType === 'dog') {
      if (hasDog) {
        console.log(`[validate-photo] Photo ${id}: APPROVED - Dog detected`)
        await updatePhotoStatus(supabaseAdmin, id, 'approved', null, { hasHuman, hasDog, hasText }, user_id)
        return new Response(
          JSON.stringify({ status: 'approved' }), 
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } else if (hasHuman && !hasDog) {
        // Special case: We see a human but no dog when looking for dog
        console.log(`[validate-photo] Photo ${id}: REJECTED - Human detected but no dog (target: dog)`)
        await deletePhotoFromStorage(supabaseAdmin, storage_path)
        await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'Human detected but dog is missing', undefined, user_id)
        return new Response(
          JSON.stringify({ status: 'rejected', reason: 'Human detected but dog is missing' }), 
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } else {
        console.log(`[validate-photo] Photo ${id}: REJECTED - Missing dog`)
        await deletePhotoFromStorage(supabaseAdmin, storage_path)
        await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'missing_dog', undefined, user_id)
        return new Response(
          JSON.stringify({ status: 'rejected', reason: 'missing_dog' }), 
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Fallback: should not reach here
    console.error(`[validate-photo] Photo ${id}: Unknown bucket_type: ${bucket_type}`)
    await updatePhotoStatus(supabaseAdmin, id, 'rejected', 'unknown_bucket_type', undefined, user_id)
    return new Response(
      JSON.stringify({ error: 'Unknown bucket_type' }), 
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (err) {
    console.error('[validate-photo] Error:', err)
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

/**
 * Updates photo status in database
 */
async function updatePhotoStatus(
  supabase: any,
  photoId: string,
  status: 'approved' | 'rejected',
  rejectionReason: string | null,
  metadata?: { hasHuman: boolean; hasDog: boolean; hasText: boolean },
  userId?: string
) {
  // Build update data - ONLY include fields that exist in the schema
  const updateData: any = {
    status,
    rejection_reason: rejectionReason,
  }

  if (metadata) {
    updateData.contains_human = metadata.hasHuman
    updateData.contains_dog = metadata.hasDog
    // Note: contains_both is computed as contains_dog && contains_human (removed from DB)
    // Note: classification is computed from contains_dog and contains_human (removed from DB)
    // DO NOT set: classification, contains_both, ai_labels, ai_text, client_labels, server_labels
  }

  console.log(`[validate-photo] Updating photo ${photoId} with data:`, JSON.stringify(updateData))

  const { error } = await supabase
    .from('photos')
    .update(updateData)
    .eq('id', photoId)

  if (error) {
    console.error(`[validate-photo] Failed to update photo ${photoId}:`, error)
    throw error
  }

  console.log(`[validate-photo] Photo ${photoId}: Updated status to ${status}, reason: ${rejectionReason || 'none'}`)

  // NOTE: This edge function validates individual photos only.
  // Profile-level validation (lifecycle_status, validation_status) should be handled
  // by a separate validation job that calls applyValidationResult() with the validation_run_id.
  // DO NOT modify profile lifecycle_status or validation_status here.
  // DO NOT modify onboarding_status at all.
}

/**
 * Deletes photo from storage
 */
async function deletePhotoFromStorage(supabase: any, storagePath: string) {
  const { error } = await supabase.storage
    .from('photos')
    .remove([storagePath])

  if (error) {
    console.error(`[validate-photo] Failed to delete photo from storage ${storagePath}:`, error)
    // Don't throw - log but continue
  } else {
    console.log(`[validate-photo] Deleted photo from storage: ${storagePath}`)
  }
}
