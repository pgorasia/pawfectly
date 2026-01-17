import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getMySubscription, type MySubscription } from '@/services/billing/subscriptionService';

const subscriptionCache = new Map<string, { data: MySubscription | null; updatedAt: number }>();

export function invalidateMySubscriptionCache(userId: string) {
  subscriptionCache.delete(userId);
}

export function useMySubscription() {
  const { user } = useAuth();
  const [data, setData] = useState<MySubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const fresh = await getMySubscription();
    subscriptionCache.set(user.id, { data: fresh, updatedAt: Date.now() });
    setData(fresh);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      return;
    }

    const cached = subscriptionCache.get(user.id);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      refresh().catch((e) => console.error('[useMySubscription] refresh failed:', e));
      return;
    }

    setLoading(true);
    refresh()
      .catch((e) => console.error('[useMySubscription] initial load failed:', e))
      .finally(() => setLoading(false));
  }, [user?.id, refresh]);

  return { data, loading, refresh };
}

