/**
 * Status Repository - Single source of truth for onboarding and validation status
 * 
 * This service manages:
 * - onboarding_status: UI routing and submission tracking
 * - profiles: Discovery eligibility and validation lifecycle
 */

import { supabase } from '../supabase/supabaseClient';
import type { DogProfile, HumanProfile, Location, Preferences, ConnectionStyle } from '@/hooks/useProfileDraft';

// Global flag to check if account deletion is in progress
// This is set by AuthSessionStore and checked by service functions
let globalIsDeletingAccount = false;

/**
 * Set the global deletion flag (called by AuthSessionStore)
 */
export function setGlobalIsDeletingAccount(flag: boolean) {
  globalIsDeletingAccount = flag;
}

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
    badges?: Array<{
      type: string;
      earned: boolean;
      earnedAt: string | null;
      metadata: Record<string, any> | null;
    }>;
  };
}

/**
 * Minimal "me" data for routing and initial rendering
 * Uses optimized RPC function to fetch only needed fields
 */
export interface MeData {
  onboarding: {
    last_step: OnboardingStep;
    dog_submitted: boolean;
    human_submitted: boolean;
    photos_submitted: boolean;
    preferences_submitted: boolean;
  };
  profile: {
    lifecycle_status: 'onboarding' | 'pending_review' | 'active' | 'limited' | 'blocked';
    validation_status: 'not_started' | 'in_progress' | 'passed' | 'failed_requirements' | 'failed_photos';
    deleted_at: string | null;
  } | null;
  dogs: Array<{
    slot: number;
    name: string;
    is_active: boolean;
  }>;
  preferences: {
    pals_enabled: boolean;
    match_enabled: boolean;
  } | null;
}

/**
 * Default onboarding status object
 */
const DEFAULT_ONBOARDING_STATUS = (userId: string): OnboardingStatus => ({
  user_id: userId,
  last_step: 'pack',
  dog_submitted: false,
  human_submitted: false,
  photos_submitted: false,
  preferences_submitted: false,
  updated_at: new Date().toISOString(),
});

/**
 * Get or create onboarding_status row with defaults if missing
 * @param userId - User ID from AuthContext (avoids network call)
 * Never attempts INSERT if user is invalid or account deletion is in progress
 */
export async function getOrCreateOnboarding(userId: string | null): Promise<OnboardingStatus> {
  // Use provided userId (from AuthContext) - no network call needed
  const uid = userId;

  // If no user or deletion in progress, return default (no inserts)
  if (!uid || globalIsDeletingAccount) {
    if (!uid) {
      console.log('[statusRepository] No authenticated user, returning default onboarding status');
    } else if (globalIsDeletingAccount) {
      console.log('[statusRepository] Account deletion in progress, returning default onboarding status');
    }
    return DEFAULT_ONBOARDING_STATUS(uid || '');
  }

  // Try to get existing
  const { data: existing, error: selectError } = await supabase
    .from('onboarding_status')
    .select('*')
    .eq('user_id', uid)
    .single();

  if (existing && !selectError) {
    return existing;
  }

  // Double-check deletion state before INSERT to prevent race condition
  // (deletion could have started between initial check and SELECT above)
  if (globalIsDeletingAccount) {
    console.log('[statusRepository] Account deletion started during getOrCreateOnboarding, returning default (no INSERT)');
    return DEFAULT_ONBOARDING_STATUS(uid || '');
  }

  // Create if missing (only if user is authenticated and not deleting)
  const { data: created, error: insertError } = await supabase
    .from('onboarding_status')
    .insert({
      user_id: uid,
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
 * Load minimal "me" data for routing and initial rendering
 * Uses optimized RPC function - single network call, minimal payload
 */
export async function loadMe(): Promise<MeData> {
  const { data, error } = await supabase.rpc('load_me');

  if (error) {
    console.error('[statusRepository] Failed to load me data:', error);
    throw new Error(`Failed to load me data: ${error.message}`);
  }

  // Ensure onboarding defaults if missing
  const onboarding = data.onboarding || {
    last_step: 'pack' as OnboardingStep,
    dog_submitted: false,
    human_submitted: false,
    photos_submitted: false,
    preferences_submitted: false,
  };

  return {
    onboarding,
    profile: data.profile || null,
    dogs: data.dogs || [],
    preferences: data.preferences || null,
  };
}

/**
 * Minimal bootstrap data for signed-out or deleted states
 */
const MINIMAL_BOOTSTRAP_DATA = (userId: string | null): BootstrapData => ({
  profile: null,
  onboarding: {
    user_id: userId || '',
    last_step: 'pack',
    dog_submitted: false,
    human_submitted: false,
    photos_submitted: false,
    preferences_submitted: false,
    updated_at: new Date().toISOString(),
  },
  draft: {
    profile: null,
    dogs: [],
    preferences: null,
    badges: [],
  },
});

/**
 * Check function type for bootstrap cancellation
 */
export type BootstrapCheckFn = () => Promise<{
  shouldContinue: boolean;
  sessionUserId: string | null;
}>;

/**
 * @deprecated Use loadMe() instead. This function makes multiple wide select('*') calls.
 * Kept for backwards compatibility during migration.
 * 
 * Loads "My Pack" data including prompts in a single fetch
 * 
 * @param checkFn - Function to check if bootstrap should continue (returns { shouldContinue, sessionUserId })
 *                  If not provided, uses userId parameter
 * @param userId - User ID from AuthContext (avoids network call when checkFn not provided)
 */
export async function loadBootstrap(checkFn?: BootstrapCheckFn, userId?: string | null): Promise<BootstrapData> {
  // Get current session once at start
  const getCheck = async () => {
    if (checkFn) {
      return checkFn();
    }
    // Default check: use provided userId from AuthContext (no network call)
    const sessionUserId = userId ?? null;
    return {
      shouldContinue: sessionUserId !== null && !globalIsDeletingAccount,
      sessionUserId,
    };
  };

  let check = await getCheck();
  const initialSessionUserId = check.sessionUserId;

  // If session is null or deletion in progress, return minimal bootstrap
  if (!check.shouldContinue || !initialSessionUserId) {
    if (!initialSessionUserId) {
      console.log('[statusRepository] No session user, returning minimal bootstrap');
    } else if (globalIsDeletingAccount) {
      console.log('[statusRepository] Account deletion in progress, returning minimal bootstrap');
    }
    return MINIMAL_BOOTSTRAP_DATA(initialSessionUserId);
  }

  // Use the userId from check result (which may have come from parameter or checkFn)
  const currentUserId = initialSessionUserId;

  try {
    // Fetch profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', currentUserId)
      .maybeSingle();

    // Check if we should continue after await
    check = await getCheck();
    if (!check.shouldContinue || check.sessionUserId !== currentUserId) {
      console.log('[statusRepository] Bootstrap cancelled (session changed or deletion started)');
      return MINIMAL_BOOTSTRAP_DATA(check.sessionUserId);
    }

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[statusRepository] Failed to load profile:', profileError);
    }

    // Fetch onboarding_status using currentUserId (no network call)
    const onboarding = await getOrCreateOnboarding(currentUserId);

    // Check again after await
    check = await getCheck();
    if (!check.shouldContinue || check.sessionUserId !== currentUserId) {
      console.log('[statusRepository] Bootstrap cancelled (session changed or deletion started)');
      return MINIMAL_BOOTSTRAP_DATA(check.sessionUserId);
    }

    // Fetch draft data (dogs, preferences)
    const { data: dogs, error: dogsError } = await supabase
      .from('dogs')
      .select('*')
      .eq('user_id', currentUserId)
      .order('slot', { ascending: true });

    // Check again after await
    check = await getCheck();
    if (!check.shouldContinue || check.sessionUserId !== currentUserId) {
      console.log('[statusRepository] Bootstrap cancelled (session changed or deletion started)');
      return MINIMAL_BOOTSTRAP_DATA(check.sessionUserId);
    }

    if (dogsError) {
      console.error('[statusRepository] Failed to load dogs:', dogsError);
    }

    // Load prompts for all dogs (part of "My Pack" payload)
    let promptsBySlot: Record<number, Array<{
      prompt_question_id: string;
      answer_text: string;
      display_order: number;
    }>> = {};
    
    if (dogs && dogs.length > 0) {
      try {
        const { getAllDogPromptAnswers } = await import('../prompts/dogPromptService');
        const allPrompts = await getAllDogPromptAnswers(currentUserId);
        // Convert DogPromptAnswerWithQuestion[] to DogPrompt[] format
        promptsBySlot = Object.entries(allPrompts).reduce((acc, [slot, prompts]) => {
          acc[Number(slot)] = prompts.map(p => ({
            prompt_question_id: p.prompt_question_id,
            answer_text: p.answer_text,
            display_order: p.display_order,
          }));
          return acc;
        }, {} as Record<number, Array<{ prompt_question_id: string; answer_text: string; display_order: number }>>);
      } catch (error) {
        console.error('[statusRepository] Failed to load prompts (continuing without prompts):', error);
        // Continue without prompts - they're optional
      }
    }

    // Attach prompts to dogs as a property for conversion
    const dogsWithPrompts = (dogs || []).map((dog) => ({
      ...dog,
      _prompts: promptsBySlot[dog.slot] || [],
    }));

    const { data: preferences, error: prefsError } = await supabase
      .from('preferences')
      .select('*')
      .eq('user_id', currentUserId)
      .maybeSingle();

    // Check again after await
    check = await getCheck();
    if (!check.shouldContinue || check.sessionUserId !== currentUserId) {
      console.log('[statusRepository] Bootstrap cancelled (session changed or deletion started)');
      return MINIMAL_BOOTSTRAP_DATA(check.sessionUserId);
    }

    if (prefsError && prefsError.code !== 'PGRST116') {
      console.error('[statusRepository] Failed to load preferences:', prefsError);
    }

    // Fetch badges (only earned badges)
    const { data: badges, error: badgesError } = await supabase
      .from('trust_badges')
      .select('badge_type, earned_at, metadata, status')
      .eq('user_id', currentUserId)
      .eq('status', 'earned');

    // Check again after await
    check = await getCheck();
    if (!check.shouldContinue || check.sessionUserId !== currentUserId) {
      console.log('[statusRepository] Bootstrap cancelled (session changed or deletion started)');
      return MINIMAL_BOOTSTRAP_DATA(check.sessionUserId);
    }

    if (badgesError) {
      console.error('[statusRepository] Failed to load badges (continuing without badges):', badgesError);
    }

    // Fetch profile for selfie verification status
    const { data: profileForBadges, error: profileForBadgesError } = await supabase
      .from('profiles')
      .select('selfie_verified_at, selfie_verified_photo_id')
      .eq('user_id', currentUserId)
      .maybeSingle();

    // Check again after await
    check = await getCheck();
    if (!check.shouldContinue || check.sessionUserId !== currentUserId) {
      console.log('[statusRepository] Bootstrap cancelled (session changed or deletion started)');
      return MINIMAL_BOOTSTRAP_DATA(check.sessionUserId);
    }

    // Build badge statuses
    const badgeStatuses: Array<{
      type: string;
      earned: boolean;
      earnedAt: string | null;
      metadata: Record<string, any> | null;
    }> = [];

    // Email verified - always true (will be implemented later with OTP)
    badgeStatuses.push({
      type: 'email_verified',
      earned: true,
      earnedAt: null,
      metadata: null,
    });

    // Photo with dog - check trust_badges
    const photoWithDogBadge = badges?.find(b => b.badge_type === 'photo_with_dog');
    badgeStatuses.push({
      type: 'photo_with_dog',
      earned: !!photoWithDogBadge,
      earnedAt: photoWithDogBadge?.earned_at || null,
      metadata: photoWithDogBadge?.metadata || null,
    });

    // Selfie verified - check profile and trust_badges
    const selfieBadge = badges?.find(b => b.badge_type === 'selfie_verified');
    const isSelfieVerified = profileForBadges?.selfie_verified_at !== null;
    badgeStatuses.push({
      type: 'selfie_verified',
      earned: isSelfieVerified,
      earnedAt: profileForBadges?.selfie_verified_at || selfieBadge?.earned_at || null,
      metadata: selfieBadge?.metadata || (profileForBadges?.selfie_verified_photo_id ? { verified_photo_id: profileForBadges.selfie_verified_photo_id } : null),
    });

    return {
      profile: profile || null,
      onboarding,
      draft: {
        profile: profile || null,
        dogs: dogsWithPrompts || [],
        preferences: preferences || null,
        badges: badgeStatuses,
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

/**
 * Set profile hidden status
 * Calls RPC function set_profile_hidden to update is_hidden and hidden_at
 * Returns the new is_hidden value, or throws on error
 */
export async function setProfileHidden(hidden: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_profile_hidden', {
    p_hidden: hidden,
  });

  if (error) {
    console.error('[statusRepository] Failed to set profile hidden:', error);
    throw new Error(`Failed to set profile hidden: ${error.message}`);
  }

  if (!data?.ok) {
    const errorMsg = data?.error ?? 'Failed to set profile hidden';
    console.error('[statusRepository] set_profile_hidden returned error:', errorMsg);
    throw new Error(errorMsg);
  }

  return data.is_hidden ?? false;
}
