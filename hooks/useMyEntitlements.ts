import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getMyEntitlements, type MyEntitlements } from '@/services/entitlements/entitlementsService';

const entitlementsCache = new Map<string, { data: MyEntitlements | null; updatedAt: number }>();

export function invalidateMyEntitlementsCache(userId: string) {
  entitlementsCache.delete(userId);
}

export function useMyEntitlements() {
  const { user } = useAuth();
  const [data, setData] = useState<MyEntitlements | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const fresh = await getMyEntitlements();
    entitlementsCache.set(user.id, { data: fresh, updatedAt: Date.now() });
    setData(fresh);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      return;
    }

    const cached = entitlementsCache.get(user.id);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      refresh().catch((e) => console.error('[useMyEntitlements] refresh failed:', e));
      return;
    }

    setLoading(true);
    refresh()
      .catch((e) => console.error('[useMyEntitlements] initial load failed:', e))
      .finally(() => setLoading(false));
  }, [user?.id, refresh]);

  return { data, loading, refresh };
}

