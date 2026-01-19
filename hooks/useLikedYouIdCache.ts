import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  hasLikedYouId,
  hydrateLikedYouIds,
  refreshLikedYouIds,
  subscribeLikedYouIds,
} from '@/services/feed/likedYouIdCache';

export function useLikedYouIdCache() {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setReady(false);
      setVersion((v) => v + 1);
      return;
    }

    let unsub: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      await hydrateLikedYouIds(user.id);
      if (cancelled) return;
      setReady(true);

      // Subscribe for updates (e.g., refresh finishes or Liked You screen merges pages)
      unsub = subscribeLikedYouIds(user.id, () => {
        setVersion((v) => v + 1);
      });

      // Refresh once on app start (background). "Good enough" staleness is fine.
      refreshLikedYouIds(user.id).catch(() => {});
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user?.id]);

  const has = useMemo(() => {
    if (!user?.id) return (_candidateId: string) => false;
    return (candidateId: string) => hasLikedYouId(user.id, candidateId);
  }, [user?.id, version]);

  return { ready, has };
}

