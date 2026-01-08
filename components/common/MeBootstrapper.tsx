/**
 * Me Bootstrapper
 * Loads server-state cache (Me) once per session when user becomes available
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { useAuthSessionStore } from '@/contexts/AuthSessionStore';
import { loadBootstrap, type BootstrapCheckFn } from '@/services/profile/statusRepository';
import { supabase } from '@/services/supabase/supabaseClient';

export function MeBootstrapper() {
  const { user } = useAuth();
  const { loadFromDatabase, meLoaded, reset: resetMe } = useMe();
  const { isDeletingAccount, getBootstrapRunId, getIsDeletingAccount } = useAuthSessionStore();
  const hasBootstrapped = useRef(false);
  const runIdRef = useRef(0);
  const lastUserIdRef = useRef<string | null>(null);

  // Reset context when user changes
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    if (lastUserIdRef.current !== currentUserId) {
      // User changed - reset context and bootstrap state
      lastUserIdRef.current = currentUserId;
      resetMe();
      hasBootstrapped.current = false;
    }
  }, [user?.id, resetMe]);

  useEffect(() => {
    // Only bootstrap once per session when user becomes available
    if (user?.id && !hasBootstrapped.current && !meLoaded && !isDeletingAccount) {
      hasBootstrapped.current = true;
      runIdRef.current = getBootstrapRunId();

      // Create check function for cancellation
      // Use getIsDeletingAccount() to read current state, not closure value
      // Use user from context instead of network call
      const checkFn: BootstrapCheckFn = async () => {
        const sessionUserId = user.id; // Use user from AuthContext (no network call)
        const currentRunId = getBootstrapRunId();
        const currentlyDeleting = getIsDeletingAccount();
        
        // Check if run was cancelled or deletion started
        // Always read current deletion state via getter, not closure
        const shouldContinue = 
          sessionUserId !== null &&
          !currentlyDeleting &&
          currentRunId === runIdRef.current;

        return { shouldContinue, sessionUserId };
      };

      // Pass userId from context to avoid network call in default check
      loadBootstrap(checkFn, user.id)
        .then((bootstrapData) => {
          // Only commit if run wasn't cancelled
          // Always read current deletion state via getter, not closure
          if (runIdRef.current === getBootstrapRunId() && !getIsDeletingAccount()) {
            // Load data into Me (server-state cache)
            loadFromDatabase({
              profile: bootstrapData.draft.profile,
              dogs: bootstrapData.draft.dogs,
              preferences: bootstrapData.draft.preferences,
            });
          }
        })
        .catch((error) => {
          console.error('[MeBootstrapper] Failed to load bootstrap data:', error);
          // Reset flag on error so it can retry
          hasBootstrapped.current = false;
        });
    }
  }, [user?.id, loadFromDatabase, meLoaded, isDeletingAccount, getBootstrapRunId, getIsDeletingAccount]);

  // Reset bootstrap flag when user logs out or deletion starts
  useEffect(() => {
    if (!user || isDeletingAccount) {
      hasBootstrapped.current = false;
    }
  }, [user, isDeletingAccount]);

  return null;
}

