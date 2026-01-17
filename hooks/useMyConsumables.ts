import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { ConsumableType, MyConsumable } from '@/services/consumables/consumablesService';
import { getMyConsumables } from '@/services/consumables/consumablesService';

// Session-scoped in-memory cache to prevent flicker across navigation.
const consumablesCache = new Map<
  string,
  { data: MyConsumable[]; updatedAt: number }
>();

export function invalidateMyConsumablesCache(userId: string) {
  consumablesCache.delete(userId);
}

export function useMyConsumables() {
  const { user } = useAuth();
  const [data, setData] = useState<MyConsumable[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const fresh = await getMyConsumables();
    consumablesCache.set(user.id, { data: fresh, updatedAt: Date.now() });
    setData(fresh);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setData(null);
      setLoading(false);
      return;
    }

    const cached = consumablesCache.get(user.id);
    if (cached) {
      setData(cached.data);
      setLoading(false);
      // Background refresh for consistency.
      refresh().catch((e) => console.error('[useMyConsumables] refresh failed:', e));
      return;
    }

    setLoading(true);
    refresh()
      .catch((e) => console.error('[useMyConsumables] initial load failed:', e))
      .finally(() => setLoading(false));
  }, [user?.id, refresh]);

  const byType = (type: ConsumableType): MyConsumable | null => {
    const row = (data || []).find((c) => c.consumable_type === type);
    return row ?? null;
  };

  return { data, loading, refresh, byType };
}

