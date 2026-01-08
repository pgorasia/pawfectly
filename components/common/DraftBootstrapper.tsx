/**
 * Draft Bootstrapper
 * Initializes draft from Me (server-state cache) once per session
 * 
 * Onboarding screens use Draft, which is initialized from Me
 * This prevents "draft resets → UI resets" in tabs
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { useProfileDraft } from '@/hooks/useProfileDraft';

export function DraftBootstrapper() {
  const { user } = useAuth();
  const { me, meLoaded } = useMe();
  const { loadFromDatabase, draftHydrated, reset: resetDraft } = useProfileDraft();
  const hasBootstrapped = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Reset draft when user changes
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (lastUserIdRef.current !== currentUserId) {
      // User changed - reset draft and bootstrap state
      lastUserIdRef.current = currentUserId;
      resetDraft();
      hasBootstrapped.current = false;
    }
  }, [user?.id, resetDraft]);

  useEffect(() => {
    // Initialize draft from Me once Me is loaded and draft is not yet hydrated
    // Also ensure me.profile exists (even if fields are null, the object should exist)
    if (user?.id && meLoaded && !hasBootstrapped.current && !draftHydrated) {
      // Don't bootstrap if me.profile is completely missing (wait for it to load)
      // But allow bootstrap even if profile fields are null (user hasn't filled them yet)
      if (me.profile === undefined) {
        return; // Wait for profile to load
      }

      hasBootstrapped.current = true;

      // Convert Me data to draft format
      // me.profile is already in the correct format (MeProfile), but we need to ensure all fields are present
      // dbProfileToHumanProfile expects: display_name, dob, gender
      const profileForDraft = me.profile
        ? {
            user_id: me.profile.user_id,
            display_name: me.profile.display_name || null,
            dob: me.profile.dob || null,
            gender: me.profile.gender || null,
            city: me.profile.city || null,
            latitude: me.profile.latitude || null,
            longitude: me.profile.longitude || null,
            lifecycle_status: me.profile.lifecycle_status,
            validation_status: me.profile.validation_status,
          }
        : null;

      // Convert Me preferences back to DB format for loadFromDatabase
      const preferencesForDraft = me.connectionStyles.length > 0 || (me.preferences['pawsome-pals'] || me.preferences['pawfect-match'])
        ? {
            pals_enabled: me.connectionStyles.includes('pawsome-pals'),
            match_enabled: me.connectionStyles.includes('pawfect-match'),
            pals_preferred_genders: me.preferences['pawsome-pals']?.preferredGenders || [],
            pals_age_min: me.preferences['pawsome-pals']?.ageRange.min || null,
            pals_age_max: me.preferences['pawsome-pals']?.ageRange.max || null,
            pals_distance_miles: me.preferences['pawsome-pals']?.distance || 25,
            match_preferred_genders: me.preferences['pawfect-match']?.preferredGenders || [],
            match_age_min: me.preferences['pawfect-match']?.ageRange.min || null,
            match_age_max: me.preferences['pawfect-match']?.ageRange.max || null,
            match_distance_miles: me.preferences['pawfect-match']?.distance || 25,
          }
        : null;

      // Convert Me dogs back to DB format for loadFromDatabase
      // me.dogs are already DogProfile[] objects, but loadFromDatabase expects raw DB objects
      const dogsForDraft = me.dogs.map((dog) => ({
        id: dog.id,
        slot: dog.slot,
        name: dog.name,
        age_group: dog.ageGroup, // Convert ageGroup back to age_group
        breed: dog.breed || null,
        size: dog.size,
        energy: dog.energy,
        play_styles: dog.playStyles || [], // Convert playStyles back to play_styles
        temperament: dog.temperament,
        is_active: true,
      }));

      loadFromDatabase({
        profile: profileForDraft,
        dogs: dogsForDraft,
        preferences: preferencesForDraft,
      });
    }
  }, [user?.id, meLoaded, me, loadFromDatabase, draftHydrated]);

  // Reset bootstrap flag when user logs out
  useEffect(() => {
    if (!user) {
      hasBootstrapped.current = false;
    }
  }, [user]);

  return null;
}

