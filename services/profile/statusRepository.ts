/**
 * Status Repository - Single source of truth for onboarding and validation status
 * 
 * This service manages:
 * - onboarding_status: UI routing and submission tracking
 * - profiles: Discovery eligibility and validation lifecycle
 */

import { supabase } from '../supabase/supabaseClient';
import type { DogProfile, HumanProfile, Location, Preferences, ConnectionStyle } from '@/hooks/useProfileDraft';

export type OnboardingStep = 'pack' | 'human' | 'photos' | 'preferences' | 'done';

export interface OnboardingStatus {
  user_id: string;
  last_step: OnboardingStep;
  dog_submitted: boolean;
  human_submitted: boolean;
  photos_submitted: boolean;
  preferences_submitted: boolean;
  updated_at: string;
}

export interface ProfileStatus {
  user_id: string;
  lifecycle_status: 'onboarding' | 'pending_review' | 'active' | 'limited' | 'blocked';
  validation_status: 'not_started' | 'in_progress' | 'passed' | 'failed_requirements' | 'failed_photos';
  validation_run_id: string | null;
  validation_started_at: string | null;
  updated_at: string;
}

export interface BootstrapData {
  profile: any | null;
  onboarding: OnboardingStatus | null;
  draft: {
    profile: any | null;
    dogs: any[];
    preferences: any | null;
  };
}

/**
 * Get or create onboarding_status row with defaults if missing
 */
export async function getOrCreateOnboarding(userId: string): Promise<OnboardingStatus> {
  // Try to get existing
  const { data: existing, error: selectError } = await supabase
    .from('onboarding_status')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing && !selectError) {
    return existing;
  }

  // Create if missing
  const { data: created, error: insertError } = await supabase
    .from('onboarding_status')
    .insert({
      user_id: userId,
      last_step: 'pack',
      dog_submitted: false,
      human_submitted: false,
      photos_submitted: false,
      preferences_submitted: false,
    })
    .select()
    .single();

  if (insertError) {
    console.error('[statusRepository] Failed to create onboarding_status:', insertError);
    throw new Error(`Failed to create onboarding_status: ${insertError.message}`);
  }

  return created;
}

/**
 * Load bootstrap data: profiles, onboarding_status, and draft data
 */
export async function loadBootstrap(userId: string): Promise<BootstrapData> {
  try {
    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[statusRepository] Failed to load profile:', profileError);
    }

    // Fetch onboarding_status
    const onboarding = await getOrCreateOnboarding(userId);

    // Fetch draft data (dogs, preferences)
    const { data: dogs, error: dogsError } = await supabase
      .from('dogs')
      .select('*')
      .eq('user_id', userId)
      .order('slot', { ascending: true });

    if (dogsError) {
      console.error('[statusRepository] Failed to load dogs:', dogsError);
    }

    const { data: preferences, error: prefsError } = await supabase
      .from('preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefsError && prefsError.code !== 'PGRST116') {
      console.error('[statusRepository] Failed to load preferences:', prefsError);
    }

    return {
      profile: profile || null,
      onboarding,
      draft: {
        profile: profile || null,
        dogs: dogs || [],
        preferences: preferences || null,
      },
    };
  } catch (error) {
    console.error('[statusRepository] Error loading bootstrap:', error);
    throw error;
  }
}

/**
 * Set the current step (page) the user is on
 * ONLY updates if profile.lifecycle_status is 'onboarding' (or profile doesn't exist yet - new user)
 */
export async function setLastStep(userId: string, step: OnboardingStep): Promise<void> {
  // Check lifecycle_status - only update onboarding_status if user is in onboarding
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('lifecycle_status')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[statusRepository] Failed to check lifecycle_status:', profileError);
    throw new Error(`Failed to check lifecycle_status: ${profileError.message}`);
  }

  // If profile doesn't exist (new user) or lifecycle_status is 'onboarding', allow update
  // Otherwise, skip - user is not in onboarding phase
  if (profile && profile.lifecycle_status !== 'onboarding') {
    console.log(
      `[statusRepository] Skipping setLastStep - lifecycle_status is '${profile.lifecycle_status}', not 'onboarding'`
    );
    return; // Silently skip - user is not in onboarding phase
  }

  const { error } = await supabase
    .from('onboarding_status')
    .update({ 
      last_step: step,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[statusRepository] Failed to set last_step:', error);
    throw new Error(`Failed to set last_step: ${error.message}`);
  }
}

/**
 * Mark a step as submitted and advance to next step
 * IMPORTANT: submission means user pressed Continue, not autosave
 * ONLY updates if profile.lifecycle_status is 'onboarding' (or profile doesn't exist yet - new user)
 */
export async function markSubmitted(userId: string, step: 'dog' | 'human' | 'photos' | 'preferences'): Promise<void> {
  // Check lifecycle_status - only update onboarding_status if user is in onboarding
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('lifecycle_status')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[statusRepository] Failed to check lifecycle_status:', profileError);
    throw new Error(`Failed to check lifecycle_status: ${profileError.message}`);
  }

  // If profile doesn't exist (new user) or lifecycle_status is 'onboarding', allow update
  // Otherwise, skip - user is not in onboarding phase
  if (profile && profile.lifecycle_status !== 'onboarding') {
    console.log(
      `[statusRepository] Skipping markSubmitted - lifecycle_status is '${profile.lifecycle_status}', not 'onboarding'`
    );
    return; // Silently skip - user is not in onboarding phase
  }

  const updates: Partial<OnboardingStatus> = {
    updated_at: new Date().toISOString(),
  };

  // Set submitted flag and advance to next step
  if (step === 'dog') {
    updates.dog_submitted = true;
    updates.last_step = 'human';
  } else if (step === 'human') {
    updates.human_submitted = true;
    updates.last_step = 'photos';
  } else if (step === 'photos') {
    updates.photos_submitted = true;
    updates.last_step = 'preferences';
  } else if (step === 'preferences') {
    updates.preferences_submitted = true;
    updates.last_step = 'done';
  }

  const { error } = await supabase
    .from('onboarding_status')
    .update(updates)
    .eq('user_id', userId);

  if (error) {
    console.error('[statusRepository] Failed to mark submitted:', error);
    throw new Error(`Failed to mark submitted: ${error.message}`);
  }
}

/**
 * Start validation process
 * Sets profile to pending_review/in_progress and generates validation_run_id
 */
export async function startValidation(userId: string): Promise<string> {
  // Generate new validation_run_id
  // Use crypto.randomUUID() if available, otherwise generate a simple UUID v4
  let validationRunId: string;
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    validationRunId = crypto.randomUUID();
  } else {
    // Fallback UUID v4 generation
    validationRunId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      lifecycle_status: 'pending_review',
      validation_status: 'in_progress',
      validation_run_id: validationRunId,
      validation_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[statusRepository] Failed to start validation:', error);
    throw new Error(`Failed to start validation: ${error.message}`);
  }

  return validationRunId;
}

/**
 * Apply validation result with runId guard (latest-run-wins)
 * MUST only update if profiles.validation_run_id == runId
 */
export async function applyValidationResult(
  userId: string,
  runId: string,
  passed: boolean
): Promise<void> {
  // First, check current validation_run_id to ensure we're updating the latest run
  const { data: profile, error: checkError } = await supabase
    .from('profiles')
    .select('validation_run_id')
    .eq('user_id', userId)
    .single();

  if (checkError) {
    console.error('[statusRepository] Failed to check validation_run_id:', checkError);
    throw new Error(`Failed to check validation_run_id: ${checkError.message}`);
  }

  // Only proceed if this is the latest run
  if (profile.validation_run_id !== runId) {
    console.warn(
      `[statusRepository] Skipping validation result - runId mismatch. Expected: ${runId}, Current: ${profile.validation_run_id}`
    );
    return; // Silently skip - this is an old validation result
  }

  // Get all dogs for this user to check photo requirements per dog
  const { data: dogs, error: dogsError } = await supabase
    .from('dogs')
    .select('slot')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (dogsError) {
    console.error('[statusRepository] Failed to check dogs:', dogsError);
    throw new Error(`Failed to check dogs: ${dogsError.message}`);
  }

  const dogSlots = dogs?.map((d) => d.slot) || [];

  // Determine minimum-photo requirement
  const { data: photos, error: photosError } = await supabase
    .from('photos')
    .select('dog_slot, contains_human, contains_dog, status')
    .eq('user_id', userId)
    .eq('status', 'approved');

  if (photosError) {
    console.error('[statusRepository] Failed to check photos:', photosError);
    throw new Error(`Failed to check photos: ${photosError.message}`);
  }

  // Count approved human photos (dog_slot IS NULL AND contains_human=true)
  const approvedHumanPhotos = photos?.filter(
    (p) => p.dog_slot === null && p.contains_human === true
  ).length || 0;

  // Check if each dog has at least one approved photo
  // For each dog slot, check if there's at least one approved dog photo
  const allDogsHavePhotos = dogSlots.length > 0 && dogSlots.every((slot) => {
    return photos?.some(
      (p) => p.dog_slot === slot && p.contains_dog === true
    ) || false;
  });

  // Determine final status
  let lifecycleStatus: 'active' | 'limited' | 'pending_review';
  let validationStatus: 'passed' | 'failed_photos' | 'failed_requirements';

  if (passed) {
    lifecycleStatus = 'active';
    validationStatus = 'passed';
  } else {
    // Check if minimum requirements met (>=1 approved human AND >=1 approved dog for each dog)
    if (approvedHumanPhotos >= 1 && allDogsHavePhotos) {
      lifecycleStatus = 'limited';
      validationStatus = 'failed_photos';
    } else {
      lifecycleStatus = 'pending_review';
      validationStatus = 'failed_requirements';
    }
  }

  // Update profile with result (only if runId matches)
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      lifecycle_status: lifecycleStatus,
      validation_status: validationStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('validation_run_id', runId); // CRITICAL: Only update if runId matches

  if (updateError) {
    console.error('[statusRepository] Failed to apply validation result:', updateError);
    throw new Error(`Failed to apply validation result: ${updateError.message}`);
  }

  console.log(
    `[statusRepository] Applied validation result for user ${userId}, runId ${runId}: ${validationStatus}, lifecycle: ${lifecycleStatus}`
  );
}

