/**
 * Hook to check if current user is live (can appear in feeds)
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentUserLiveStatus } from '@/services/supabase/userService';

export interface UserLiveStatus {
  isLive: boolean | null; // null = loading
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to get and manage current user's live status
 */
export function useUserLiveStatus(): UserLiveStatus {
  const { user } = useAuth();
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (!user?.id) {
      setIsLive(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const liveStatus = await getCurrentUserLiveStatus();
      setIsLive(liveStatus);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check live status';
      setError(errorMessage);
      console.error('[useUserLiveStatus] Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [user?.id]);

  return {
    isLive,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}

