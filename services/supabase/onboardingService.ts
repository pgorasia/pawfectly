/**
 * Onboarding service for saving and loading user onboarding data
 */

import { supabase } from './supabaseClient';
import type { DogProfile, HumanProfile, Location, Preferences, ConnectionStyle } from '@/hooks/useProfileDraft';

export type OnboardingStep = 'pack' | 'human' | 'photos' | 'preferences' | 'done';

export interface OnboardingState {
  user_id: string;
  last_step: OnboardingStep;
  dog_completed: boolean;
  human_completed: boolean;
  photos_completed: boolean;
  preferences_completed: boolean;
  updated_at: string;
}

/**
 * Initialize onboarding state for a new user
 */
export async function initializeOnboardingState(userId: string): Promise<void> {
  const { error } = await supabase
    .from('onboarding_state')
    .insert({
      user_id: userId,
      last_step: 'pack',
      dog_completed: false,
      human_completed: false,
      photos_completed: false,
      preferences_completed: false,
    });

  if (error) {
    console.error('[OnboardingService] Failed to initialize onboarding state:', error);
    throw new Error(`Failed to initialize onboarding state: ${error.message}`);
  }
}

/**
 * Get onboarding state for a user
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState | null> {
  const { data, error } = await supabase
    .from('onboarding_state')
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
  updates: Partial<Omit<OnboardingState, 'user_id' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('onboarding_state')
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
    // First get existing profile to preserve status
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('status')
      .eq('user_id', userId)
      .single();

    // Save profile data preserving existing status (or 'active' if new)
    const profileData: any = {
      user_id: userId,
      display_name: human.name || null,
      dob: human.dateOfBirth || null,
      gender: human.gender || null,
      city: location?.city || null,
      lat: location?.latitude || null,
      lng: location?.longitude || null,
      status: existingProfile?.status || 'active', // Preserve existing status or default to 'active'
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
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          status: 'draft',
        });

      if (profileError) {
        console.error('[OnboardingService] Failed to create profile:', profileError);
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
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

    // Update onboarding state - mark dog as completed
    await updateOnboardingState(userId, {
      dog_completed: true,
    });
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
    const profileData: any = {
      user_id: userId,
      display_name: human.name || null,
      dob: human.dateOfBirth || null,
      gender: human.gender || null,
      city: location?.city || null,
      lat: location?.latitude || null,
      lng: location?.longitude || null,
      status: 'draft',
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profileData, { onConflict: 'user_id' });

    if (profileError) {
      console.error('[OnboardingService] Failed to save profile:', profileError);
      throw new Error(`Failed to save profile: ${profileError.message}`);
    }

    // Update onboarding state - mark human as completed
    await updateOnboardingState(userId, {
      human_completed: true,
    });
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
    const profileData: any = {
      user_id: userId,
      display_name: human.name || null,
      dob: human.dateOfBirth || null,
      gender: human.gender || null,
      city: location?.city || null,
      lat: location?.latitude || null,
      lng: location?.longitude || null,
      status: 'draft',
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

    // Update onboarding state
    await updateOnboardingState(userId, {
      last_step: 'human',
      dog_completed: true,
      human_completed: true,
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

    const { error } = await supabase
      .from('preferences')
      .upsert(prefsData, { onConflict: 'user_id' });

    if (error) {
      console.error('[OnboardingService] Failed to update preferences:', error);
      throw new Error(`Failed to update preferences: ${error.message}`);
    }

    // Do NOT update onboarding state - this is just a preferences update
  } catch (error) {
    console.error('[OnboardingService] Error updating preferences data:', error);
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

    // Update onboarding state - mark preferences as completed and set to done
    await updateOnboardingState(userId, {
      last_step: 'done',
      preferences_completed: true,
    });
  } catch (error) {
    console.error('[OnboardingService] Error saving preferences data:', error);
    throw error;
  }
}

/**
 * Load user data from database
 */
export async function loadUserData(userId: string): Promise<{
  profile: any;
  dogs: any[];
  preferences: any;
  onboardingState: OnboardingState | null;
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
 */
export function dbDogToDogProfile(dbDog: any): DogProfile {
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
  };
}

/**
 * Convert database profile to HumanProfile format
 */
export function dbProfileToHumanProfile(dbProfile: any): HumanProfile {
  return {
    name: dbProfile.display_name || '',
    dateOfBirth: dbProfile.dob || '',
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

