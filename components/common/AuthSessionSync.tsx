/**
 * Auth Session Sync
 * Bridges AuthContext state to AuthSessionStore
 * Must be a child of both AuthProvider and AuthSessionStoreProvider
 * Handles defensive auth state changes to cancel stale bootstrap operations
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthSessionStore } from '@/contexts/AuthSessionStore';
import { onAuthStateChange } from '@/services/supabase/authService';

export function AuthSessionSync() {
  const { user, session } = useAuth();
  const { setCurrentUserId, bumpBootstrapRunId } = useAuthSessionStore();
  const prevUserIdRef = useRef<string | null>(null);

  // Sync user ID to store
  useEffect(() => {
    const userId = user?.id ?? null;
    setCurrentUserId(userId);
    
    // If user changed, bump bootstrap run ID
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      if (userId === null) {
        // Signed out - bump to cancel any in-flight bootstrap
        bumpBootstrapRunId();
      } else {
        // Signed in with new user - bump to trigger fresh bootstrap
        bumpBootstrapRunId();
      }
    }
  }, [user?.id, setCurrentUserId, bumpBootstrapRunId]);

  // Register defensive auth listener at app root
  useEffect(() => {
    const { unsubscribe } = onAuthStateChange((event, session) => {
      console.log('[AuthSessionSync] Auth state changed:', event, session?.user?.id);
      
      // Bump bootstrap run ID on auth state changes to cancel stale runs
      if (event === 'SIGNED_OUT') {
        bumpBootstrapRunId();
      } else if (event === 'SIGNED_IN' && session?.user?.id) {
        bumpBootstrapRunId();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [bumpBootstrapRunId]);

  return null;
}
