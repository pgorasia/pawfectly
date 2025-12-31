/**
 * Me Bootstrapper
 * Loads server-state cache (Me) once per session when user becomes available
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { loadBootstrap } from '@/services/profile/statusRepository';

export function MeBootstrapper() {
  const { user } = useAuth();
  const { loadFromDatabase, meLoaded } = useMe();
  const hasBootstrapped = useRef(false);

  useEffect(() => {
    // Only bootstrap once per session when user becomes available
    if (user?.id && !hasBootstrapped.current && !meLoaded) {
      hasBootstrapped.current = true;

      loadBootstrap(user.id)
        .then((bootstrapData) => {
          // Load data into Me (server-state cache)
          loadFromDatabase({
            profile: bootstrapData.draft.profile,
            dogs: bootstrapData.draft.dogs,
            preferences: bootstrapData.draft.preferences,
          });
        })
        .catch((error) => {
          console.error('[MeBootstrapper] Failed to load bootstrap data:', error);
          // Reset flag on error so it can retry
          hasBootstrapped.current = false;
        });
    }
  }, [user?.id, loadFromDatabase, meLoaded]);

  // Reset bootstrap flag when user logs out
  useEffect(() => {
    if (!user) {
      hasBootstrapped.current = false;
    }
  }, [user]);

  return null;
}

