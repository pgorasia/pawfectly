/**
 * Onboarding service for saving and loading user onboarding data
 */

import { supabase } from './supabaseClient';
import type { DogProfile, HumanProfile, Location, Preferences, ConnectionStyle } from '@/hooks/useProfileDraft';
import { saveDogPromptAnswers, getAllDogPromptAnswers } from '../prompts/dogPromptService';

export type OnboardingStep = 'pack' | 'human' | 'photos' | 'preferences' | 'done';

/**
 * Convert date from display format (mm/dd/yyyy) to database format (YYYY-MM-DD)
 */
function convertDisplayToDbDate(displayDate: string): string | null {
  if (!displayDate) return null;
  
  const parts = displayDate.split('/');
  if (parts.length !== 3) return null;
  
  const [month, day, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Convert date from database format (YYYY-MM-DD) to display format (mm/dd/yyyy)
 */
function convertDbToDisplayDate(dbDate: string): string {
  if (!dbDate) return '';
  
  const parts = dbDate.split('-');
  if (parts.length !== 3) return '';
  
  const [year, month, day] = parts;
  return `${month}/${day}/${year}`;
}

export interface OnboardingStatus {
  user_id: string;
  last_step: OnboardingStep;
  dog_submitted: boolean;
  human_submitted: boolean;
  photos_submitted: boolean;
  preferences_submitted: boolean;
  updated_at: string;
}

/**
 * Initialize onboarding state for a new user
 */
export async function initializeOnboardingState(userId: string): Promise<void> {
  const { error } = await supabase
    .from('onboarding_status')
    .insert({
      user_id: userId,
      last_step: 'pack',
      dog_submitted: false,
      human_submitted: false,
      photos_submitted: false,
      preferences_submitted: false,
    });

  if (error) {
    console.error('[OnboardingService] Failed to initialize onboarding state:', error);
    throw new Error(`Failed to initialize onboarding state: ${error.message}`);
  }
}

/**
 * Get onboarding state for a user
 */
export async function getOnboardingState(userId: string): Promise<OnboardingStatus | null> {
  const { data, error } = await supabase
    .from('onboarding_status')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No row found - user hasn't started onboarding
      return null;
    }
    console.error('[OnboardingService] Failed to get onboarding state:', error);
    throw new Error(`Failed to get onboarding state: ${error.message}`);
  }

  return data;
}

/**
 * Update onboarding state
 */
export async function updateOnboardingState(
  userId: string,
  updates: Partial<Omit<OnboardingStatus, 'user_id' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('onboarding_status')
    .update(updates)
    .eq('user_id', userId);

  if (error) {
    console.error('[OnboardingService] Failed to update onboarding state:', error);
    throw new Error(`Failed to update onboarding state: ${error.message}`);
  }
}

/**
 * Set the current step (page) the user is on
 * This should be called when a user navigates to a page to track where they are
 */
export async function setCurrentStep(
  userId: string,
  step: OnboardingStep
): Promise<void> {
  await updateOnboardingState(userId, {
    last_step: step,
  });
}

/**
 * Update profile data (dogs, human profile, location) without affecting onboarding state or profile status
 * Use this for editing profile after onboarding is complete
 */
export async function updateProfileData(
  userId: string,
  dogs: DogProfile[],
  human: HumanProfile,
  location: Location | null
): Promise<void> {
  try {
    // Note: lifecycle_status and validation_status are managed by statusRepository
    // No need to fetch existing profile - upsert will handle it

    // Save profile data (lifecycle_status and validation_status are managed by statusRepository)
    const profileData: any = {
      user_id: userId,
      display_name: human.name || null,
      dob: convertDisplayToDbDate(human.dateOfBirth || ''),
      gender: human.gender || null,
      city: location?.city || null,
      latitude: location?.latitude || null,
      longitude: location?.longitude || null,
      // Note: lifecycle_status and validation_status are managed by statusRepository, not here
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profileData, { onConflict: 'user_id' });

    if (profileError) {
      console.error('[OnboardingService] Failed to update profile:', profileError);
      throw new Error(`Failed to update profile: ${profileError.message}`);
    }

    // Delete existing dogs for this user
    const { error: deleteError } = await supabase
      .from('dogs')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[OnboardingService] Failed to delete existing dogs:', deleteError);
      // Continue anyway - might be first time
    }

    // Save dogs
    if (dogs.length > 0) {
      const dogsData = dogs.map((dog) => ({
        user_id: userId,
        slot: dog.slot,
        name: dog.name,
        age_group: dog.ageGroup,
        breed: dog.breed || null,
        size: dog.size,
        energy: dog.energy,
        play_styles: dog.playStyles || [],
        temperament: dog.temperament as string,
        is_active: true,
      }));

      const { error: dogsError } = await supabase
        .from('dogs')
        .insert(dogsData);

      if (dogsError) {
        console.error('[OnboardingService] Failed to save dogs:', dogsError);
        throw new Error(`Failed to save dogs: ${dogsError.message}`);
      }
    }

    // Do NOT update onboarding state - this is just a profile update
  } catch (error) {
    console.error('[OnboardingService] Error updating profile data:', error);
    throw error;
  }
}

/**
 * Save dog data during onboarding
 */
export async function saveDogData(
  userId: string,
  dogs: DogProfile[]
): Promise<void> {
  try {
    // Ensure profile exists first (required for foreign key constraint)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .single();

    if (!existingProfile) {
      // Create minimal profile record if it doesn't exist
      // lifecycle_status defaults to 'onboarding' and validation_status defaults to 'not_started'
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
        });

      if (profileError) {
        console.error('[OnboardingService] Failed to create profile:', profileError);
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
    }

    // Upsert dogs by (user_id, slot) - only update existing, insert new, delete missing slots
    if (dogs.length > 0) {
      // Validate all dogs have required fields before saving
      const invalidDogs = dogs.filter((dog) => !dog.temperament);
      if (invalidDogs.length > 0) {
        throw new Error('All dogs must have a temperament set before saving');
      }

      const dogsData = dogs.map((dog) => ({
        user_id: userId,
        slot: dog.slot,
        name: dog.name,
        age_group: dog.ageGroup,
        breed: dog.breed || null,
        size: dog.size,
        energy: dog.energy,
        play_styles: dog.playStyles || [],
        temperament: dog.temperament as string,
        is_active: true,
      }));

      // Upsert dogs (insert or update based on unique index user_id + slot)
      // Supabase will use the unique index idx_dogs_user_id_slot for conflict resolution
      const { error: upsertError } = await supabase
        .from('dogs')
        .upsert(dogsData, { onConflict: 'user_id,slot', ignoreDuplicates: false });

      if (upsertError) {
        console.error('[OnboardingService] Failed to upsert dogs:', upsertError);
        throw new Error(`Failed to save dogs: ${upsertError.message}`);
      }

      // Save prompt answers for each dog
      for (const dog of dogs) {
        if (dog.prompts && dog.prompts.length > 0) {
          try {
            await saveDogPromptAnswers(userId, dog.slot, dog.prompts);
          } catch (error) {
            console.error(`[OnboardingService] Failed to save prompts for dog slot ${dog.slot}:`, error);
            // Don't throw - prompts are optional
          }
        } else {
          // If no prompts, ensure any existing prompts are deleted
          try {
            const { deleteError } = await supabase
              .from('dog_prompt_answers')
              .delete()
              .eq('user_id', userId)
              .eq('dog_slot', dog.slot);
            
            if (deleteError) {
              console.error(`[OnboardingService] Failed to delete prompts for dog slot ${dog.slot}:`, deleteError);
            }
          } catch (error) {
            console.error(`[OnboardingService] Error cleaning up prompts for dog slot ${dog.slot}:`, error);
          }
        }
      }

      // Delete dogs for slots that are no longer present
      // Only delete if we have fewer dogs than possible (max 3 slots)
      const currentSlots = dogs.map(d => d.slot);
      if (currentSlots.length < 3) {
        // Get existing slots from database to find which ones to delete
        const { data: existingDogs } = await supabase
          .from('dogs')
          .select('slot')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (existingDogs) {
          const existingSlots = existingDogs.map(d => d.slot).filter((slot): slot is number => slot !== null);
          const slotsToDelete = existingSlots.filter(slot => !currentSlots.includes(slot));

          if (slotsToDelete.length > 0) {
            const { error: deleteError } = await supabase
              .from('dogs')
              .delete()
              .eq('user_id', userId)
              .in('slot', slotsToDelete);

            if (deleteError) {
              console.error('[OnboardingService] Failed to delete removed dogs:', deleteError);
              // Don't throw - this is cleanup, not critical
            }

            // Also delete prompts for deleted dogs
            for (const slot of slotsToDelete) {
              try {
                const { deleteError: promptDeleteError } = await supabase
                  .from('dog_prompt_answers')
                  .delete()
                  .eq('user_id', userId)
                  .eq('dog_slot', slot);
                
                if (promptDeleteError) {
                  console.error(`[OnboardingService] Failed to delete prompts for deleted dog slot ${slot}:`, promptDeleteError);
                }
              } catch (error) {
                console.error(`[OnboardingService] Error deleting prompts for slot ${slot}:`, error);
              }
            }
          }
        }
      }
    } else {
      // If no dogs provided, delete all dogs for this user
      const { error: deleteError } = await supabase
        .from('dogs')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.error('[OnboardingService] Failed to delete all dogs:', deleteError);
        // Don't throw - might be first time
      }
    }

    // Note: This is autosave/draft save, not submission
    // Submission is handled by markSubmitted() in statusRepository
    // We don't update submission flags here to avoid confusion
  } catch (error) {
    console.error('[OnboardingService] Error saving dog data:', error);
    throw error;
  }
}

/**
 * Save human profile data during onboarding
 */
export async function saveHumanData(
  userId: string,
  human: HumanProfile,
  location: Location | null
): Promise<void> {
  try {
    // Save profile data
    // lifecycle_status and validation_status are managed by statusRepository, not here
    const profileData: any = {
      user_id: userId,
      display_name: human.name || null,
      dob: convertDisplayToDbDate(human.dateOfBirth || ''),
      gender: human.gender || null,
      city: location?.city || null,
      latitude: location?.latitude || null,
      longitude: location?.longitude || null,
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profileData, { onConflict: 'user_id' });

    if (profileError) {
      console.error('[OnboardingService] Failed to save profile:', profileError);
      throw new Error(`Failed to save profile: ${profileError.message}`);
    }

    // Note: This is autosave/draft save, not submission
    // Submission is handled by markSubmitted() in statusRepository
    // We don't update submission flags here to avoid confusion
  } catch (error) {
    console.error('[OnboardingService] Error saving human data:', error);
    throw error;
  }
}

/**
 * Save pack data (dogs, human profile, location) - deprecated, use saveDogData and saveHumanData separately
 * @deprecated Use saveDogData and saveHumanData instead
 */
export async function savePackData(
  userId: string,
  dogs: DogProfile[],
  human: HumanProfile,
  location: Location | null
): Promise<void> {
  try {
    // Save profile data
    // lifecycle_status and validation_status are managed by statusRepository, not here
    const profileData: any = {
      user_id: userId,
      display_name: human.name || null,
      dob: convertDisplayToDbDate(human.dateOfBirth || ''),
      gender: human.gender || null,
      city: location?.city || null,
      latitude: location?.latitude || null,
      longitude: location?.longitude || null,
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profileData, { onConflict: 'user_id' });

    if (profileError) {
      console.error('[OnboardingService] Failed to save profile:', profileError);
      throw new Error(`Failed to save profile: ${profileError.message}`);
    }

    // Delete existing dogs for this user
    const { error: deleteError } = await supabase
      .from('dogs')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[OnboardingService] Failed to delete existing dogs:', deleteError);
      // Continue anyway - might be first time
    }

    // Save dogs
    if (dogs.length > 0) {
      // Validate all dogs have required fields before saving
      const invalidDogs = dogs.filter((dog) => !dog.temperament);
      if (invalidDogs.length > 0) {
        throw new Error('All dogs must have a temperament set before saving');
      }

      const dogsData = dogs.map((dog) => ({
        user_id: userId,
        slot: dog.slot,
        name: dog.name,
        age_group: dog.ageGroup,
        breed: dog.breed || null,
        size: dog.size,
        energy: dog.energy,
        play_styles: dog.playStyles || [],
        temperament: dog.temperament as string, // Type assertion since we validated above
        is_active: true,
      }));

      const { error: dogsError } = await supabase
        .from('dogs')
        .insert(dogsData);

      if (dogsError) {
        console.error('[OnboardingService] Failed to save dogs:', dogsError);
        throw new Error(`Failed to save dogs: ${dogsError.message}`);
      }
    }

    // Note: This is deprecated - use saveDogData and saveHumanData separately
    // Update onboarding state
    await updateOnboardingState(userId, {
      last_step: 'human',
      // Note: Submission flags should be set via markSubmitted() in statusRepository
    });
  } catch (error) {
    console.error('[OnboardingService] Error saving pack data:', error);
    throw error;
  }
}

/**
 * Update preferences data without affecting onboarding state
 * Use this for editing preferences after onboarding is complete
 */
export async function updatePreferencesData(
  userId: string,
  connectionStyles: ConnectionStyle[],
  preferences: {
    'pawsome-pals': Preferences | null;
    'pawfect-match': Preferences | null;
  }
): Promise<void> {
  try {
    const prefsData: any = {
      user_id: userId,
      pals_enabled: connectionStyles.includes('pawsome-pals'),
      match_enabled: connectionStyles.includes('pawfect-match'),
    };

    // Set pawsome-pals preferences if enabled
    if (connectionStyles.includes('pawsome-pals') && preferences['pawsome-pals']) {
      const palsPrefs = preferences['pawsome-pals'];
      prefsData.pals_preferred_genders = palsPrefs.preferredGenders.filter(g => g !== 'any');
      prefsData.pals_age_min = palsPrefs.ageRange.min || null;
      prefsData.pals_age_max = palsPrefs.ageRange.max || null;
      prefsData.pals_distance_miles = palsPrefs.distance || null;
    }

    // Set pawfect-match preferences if enabled
    if (connectionStyles.includes('pawfect-match') && preferences['pawfect-match']) {
      const matchPrefs = preferences['pawfect-match'];
      prefsData.match_preferred_genders = matchPrefs.preferredGenders.filter(g => g !== 'any');
      prefsData.match_age_min = matchPrefs.ageRange.min || null;
      prefsData.match_age_max = matchPrefs.ageRange.max || null;
      prefsData.match_distance_miles = matchPrefs.distance || null;
    }

    console.log('[OnboardingService] 📤 Upserting to database:', {
      pals_enabled: prefsData.pals_enabled,
      match_enabled: prefsData.match_enabled,
    });

    const { error } = await supabase
      .from('preferences')
      .upsert(prefsData, { onConflict: 'user_id' });

    if (error) {
      console.error('[OnboardingService] ❌ Database error:', error);
      throw new Error(`Failed to update preferences: ${error.message}`);
    }

    console.log('[OnboardingService] ✅ Database updated successfully');

    // Do NOT update onboarding state - this is just a preferences update
  } catch (error) {
    console.error('[OnboardingService] ❌ Error updating preferences:', error);
    throw error;
  }
}

/**
 * Save preferences data during onboarding
 */
export async function savePreferencesData(
  userId: string,
  connectionStyles: ConnectionStyle[],
  preferences: {
    'pawsome-pals': Preferences | null;
    'pawfect-match': Preferences | null;
  }
): Promise<void> {
  try {
    const prefsData: any = {
      user_id: userId,
      pals_enabled: connectionStyles.includes('pawsome-pals'),
      match_enabled: connectionStyles.includes('pawfect-match'),
    };

    // Set pawsome-pals preferences if enabled
    if (connectionStyles.includes('pawsome-pals') && preferences['pawsome-pals']) {
      const palsPrefs = preferences['pawsome-pals'];
      prefsData.pals_preferred_genders = palsPrefs.preferredGenders.filter(g => g !== 'any');
      prefsData.pals_age_min = palsPrefs.ageRange.min || null;
      prefsData.pals_age_max = palsPrefs.ageRange.max || null;
      prefsData.pals_distance_miles = palsPrefs.distance || null;
    }

    // Set pawfect-match preferences if enabled
    if (connectionStyles.includes('pawfect-match') && preferences['pawfect-match']) {
      const matchPrefs = preferences['pawfect-match'];
      prefsData.match_preferred_genders = matchPrefs.preferredGenders.filter(g => g !== 'any');
      prefsData.match_age_min = matchPrefs.ageRange.min || null;
      prefsData.match_age_max = matchPrefs.ageRange.max || null;
      prefsData.match_distance_miles = matchPrefs.distance || null;
    }

    const { error } = await supabase
      .from('preferences')
      .upsert(prefsData, { onConflict: 'user_id' });

    if (error) {
      console.error('[OnboardingService] Failed to save preferences:', error);
      throw new Error(`Failed to save preferences: ${error.message}`);
    }

    // Note: This is autosave/draft save, not submission
    // Submission is handled by markSubmitted() in statusRepository
    // Update onboarding state - set last_step but don't mark as submitted here
    await updateOnboardingState(userId, {
      last_step: 'done',
      // Note: preferences_submitted should be set via markSubmitted() in statusRepository
    });
  } catch (error) {
    console.error('[OnboardingService] Error saving preferences data:', error);
    throw error;
  }
}

/**
 * @deprecated Use loadMe() from statusRepository instead. This function makes 4 wide select('*') calls.
 * Kept for backwards compatibility during migration.
 */
export async function loadUserData(userId: string): Promise<{
  profile: any;
  dogs: any[];
  preferences: any;
  onboardingState: OnboardingStatus | null;
}> {
  try {
    // Load profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('[OnboardingService] Failed to load profile:', profileError);
    }

    // Load dogs
    const { data: dogs, error: dogsError } = await supabase
      .from('dogs')
      .select('*')
      .eq('user_id', userId)
      .order('slot', { ascending: true });

    if (dogsError) {
      console.error('[OnboardingService] Failed to load dogs:', dogsError);
    }

    // Load preferences
    const { data: preferences, error: prefsError } = await supabase
      .from('preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (prefsError && prefsError.code !== 'PGRST116') {
      console.error('[OnboardingService] Failed to load preferences:', prefsError);
    }

    // Load onboarding state
    const onboardingState = await getOnboardingState(userId);

    return {
      profile: profile || null,
      dogs: dogs || [],
      preferences: preferences || null,
      onboardingState,
    };
  } catch (error) {
    console.error('[OnboardingService] Error loading user data:', error);
    throw error;
  }
}

/**
 * Convert database dog to DogProfile format
 * Note: Prompts are loaded separately and should be attached after calling this function
 */
export function dbDogToDogProfile(dbDog: any, prompts?: Array<{
  prompt_question_id: string;
  answer_text: string;
  display_order: number;
}>): DogProfile {
  return {
    id: dbDog.id || `dog-${Date.now()}`,
    slot: dbDog.slot,
    name: dbDog.name,
    ageGroup: dbDog.age_group,
    breed: dbDog.breed || '',
    size: dbDog.size,
    energy: dbDog.energy,
    playStyles: dbDog.play_styles || [],
    temperament: dbDog.temperament,
    prompts: prompts && prompts.length > 0 ? prompts : undefined,
  };
}

/**
 * Load dogs with their prompts from database
 */
export async function loadDogsWithPrompts(userId: string): Promise<DogProfile[]> {
  // Load dogs
  const { data: dogs, error: dogsError } = await supabase
    .from('dogs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('slot', { ascending: true });

  if (dogsError) {
    console.error('[OnboardingService] Failed to load dogs:', dogsError);
    throw new Error(`Failed to load dogs: ${dogsError.message}`);
  }

  if (!dogs || dogs.length === 0) {
    return [];
  }

  // Load prompts for all dogs
  let promptsBySlot: Record<number, Array<{
    prompt_question_id: string;
    answer_text: string;
    display_order: number;
  }>> = {};

  try {
    const allPrompts = await getAllDogPromptAnswers(userId);
    promptsBySlot = allPrompts;
  } catch (error) {
    console.error('[OnboardingService] Failed to load prompts (continuing without prompts):', error);
    // Continue without prompts - they're optional
  }

  // Convert dogs and attach prompts
  return dogs.map((dbDog) => {
    const prompts = promptsBySlot[dbDog.slot];
    return dbDogToDogProfile(dbDog, prompts);
  });
}

/**
 * Convert database profile to HumanProfile format
 */
export function dbProfileToHumanProfile(dbProfile: any): HumanProfile {
  return {
    name: dbProfile.display_name || '',
    dateOfBirth: convertDbToDisplayDate(dbProfile.dob || ''),
    gender: dbProfile.gender || null,
  };
}

/**
 * Convert database preferences to draft preferences format
 */
export function dbPreferencesToDraftPreferences(dbPrefs: any): {
  connectionStyles: ConnectionStyle[];
  preferences: {
    'pawsome-pals': Preferences | null;
    'pawfect-match': Preferences | null;
  };
} {
  const connectionStyles: ConnectionStyle[] = [];
  if (dbPrefs?.pals_enabled) connectionStyles.push('pawsome-pals');
  if (dbPrefs?.match_enabled) connectionStyles.push('pawfect-match');

  const preferences: {
    'pawsome-pals': Preferences | null;
    'pawfect-match': Preferences | null;
  } = {
    'pawsome-pals': null,
    'pawfect-match': null,
  };

  if (dbPrefs?.pals_enabled) {
    preferences['pawsome-pals'] = {
      preferredGenders: dbPrefs.pals_preferred_genders || [],
      ageRange: {
        min: dbPrefs.pals_age_min || null,
        max: dbPrefs.pals_age_max || null,
      },
      distance: dbPrefs.pals_distance_miles || 25,
    };
  }

  if (dbPrefs?.match_enabled) {
    preferences['pawfect-match'] = {
      preferredGenders: dbPrefs.match_preferred_genders || [],
      ageRange: {
        min: dbPrefs.match_age_min || null,
        max: dbPrefs.match_age_max || null,
      },
      distance: dbPrefs.match_distance_miles || 25,
    };
  }

  return { connectionStyles, preferences };
}

