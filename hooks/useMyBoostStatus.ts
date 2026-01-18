import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import storage from '@/services/storage/storage';
import { getMyBoostStatus, startMyBoost, type MyBoostStatus } from '@/services/consumables/boostService';

type BoostCache = {
  startedAt: string;
  endsAt: string;
  syncedAtMs: number;
};

const STORAGE_KEY_PREFIX = 'boost_status_cache_v1:';
const memCache = new Map<string, BoostCache | null>();

function toMs(iso: string) {
  return new Date(iso).getTime();
}

function computeRemainingSeconds(endsAtIso: string) {
  const ms = toMs(endsAtIso) - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

async function readCache(userId: string): Promise<BoostCache | null> {
  if (memCache.has(userId)) return memCache.get(userId) ?? null;
  const raw = await storage.getString(STORAGE_KEY_PREFIX + userId);
  const s = typeof raw === 'string' ? raw : await raw;
  if (!s) {
    memCache.set(userId, null);
    return null;
  }
  try {
    const parsed = JSON.parse(s) as BoostCache;
    if (!parsed?.endsAt || !parsed?.startedAt) {
      memCache.set(userId, null);
      return null;
    }
    memCache.set(userId, parsed);
    return parsed;
  } catch {
    memCache.set(userId, null);
    return null;
  }
}

async function writeCache(userId: string, cache: BoostCache | null) {
  memCache.set(userId, cache);
  const key = STORAGE_KEY_PREFIX + userId;
  if (!cache) {
    await storage.delete(key);
    return;
  }
  await storage.set(key, JSON.stringify(cache));
}

export function invalidateMyBoostStatusCache(userId: string) {
  memCache.delete(userId);
  // Best-effort: also clear persisted cache.
  storage.delete(STORAGE_KEY_PREFIX + userId);
}

export function useMyBoostStatus(enabled: boolean = true) {
  const { user } = useAuth();
  const [status, setStatus] = useState<MyBoostStatus>({
    is_active: false,
    started_at: null,
    ends_at: null,
    remaining_seconds: 0,
  });
  const [loading, setLoading] = useState(true);
  const endsAtRef = useRef<string | null>(null);

  const isActive = status.is_active === true && !!status.ends_at;
  const remainingSeconds = status.remaining_seconds ?? 0;

  const applyActiveFromEndsAt = useCallback((startedAt: string, endsAt: string) => {
    endsAtRef.current = endsAt;
    setStatus({
      is_active: true,
      started_at: startedAt,
      ends_at: endsAt,
      remaining_seconds: computeRemainingSeconds(endsAt),
    });
  }, []);

  const clearLocal = useCallback(async () => {
    if (!user?.id) return;
    endsAtRef.current = null;
    setStatus({ is_active: false, started_at: null, ends_at: null, remaining_seconds: 0 });
    await writeCache(user.id, null);
  }, [user?.id]);

  const refreshFromServer = useCallback(async () => {
    if (!user?.id) return;
    const s = await getMyBoostStatus();
    setStatus(s);
    if (s.is_active && s.ends_at && s.started_at) {
      endsAtRef.current = s.ends_at;
      await writeCache(user.id, { startedAt: s.started_at, endsAt: s.ends_at, syncedAtMs: Date.now() });
    } else {
      endsAtRef.current = null;
      await writeCache(user.id, null);
    }
  }, [user?.id]);

  // Initial load: use cache if valid; otherwise hit server once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }
      if (!user?.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const cached = await readCache(user.id);
      if (cancelled) return;

      if (cached && computeRemainingSeconds(cached.endsAt) > 0) {
        applyActiveFromEndsAt(cached.startedAt, cached.endsAt);
        setLoading(false);
        return;
      }

      await writeCache(user.id, null);
      await refreshFromServer();
      if (!cancelled) setLoading(false);
    })().catch((e) => {
      console.error('[useMyBoostStatus] init failed:', e);
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, applyActiveFromEndsAt, refreshFromServer]);

  // Per-second countdown (client-side), derived from cached/known ends_at.
  useEffect(() => {
    if (!enabled) return;
    if (!isActive || !status.ends_at) return;
    const id = setInterval(() => {
      const endsAt = endsAtRef.current;
      if (!endsAt) return;
      const next = computeRemainingSeconds(endsAt);
      setStatus((prev) => {
        if (!prev.is_active || prev.ends_at !== endsAt) return prev;
        if (prev.remaining_seconds === next) return prev;
        return { ...prev, remaining_seconds: next };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, status.ends_at]);

  // When local timer expires, cache is no longer up-to-date -> confirm with server once.
  useEffect(() => {
    if (!enabled) return;
    if (!user?.id) return;
    if (!isActive) return;
    if (remainingSeconds > 0) return;
    // Cache no longer up-to-date. Clear locally and confirm server truth.
    clearLocal()
      .then(() => refreshFromServer())
      .catch(() => {});
  }, [user?.id, isActive, remainingSeconds, clearLocal, refreshFromServer]);

  // On app resume: only hit server if cache is missing/expired (i.e. local not up-to-date).
  useEffect(() => {
    if (!enabled) return;
    if (!user?.id) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const endsAt = endsAtRef.current;
      if (!endsAt) {
        refreshFromServer().catch(() => {});
        return;
      }
      if (computeRemainingSeconds(endsAt) <= 0) {
        // Cache expired -> not up-to-date.
        refreshFromServer().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user?.id, refreshFromServer]);

  const start = useCallback(async () => {
    if (!user?.id) return { ok: false as const, error: 'not_authenticated' };
    const res = await startMyBoost();
    if (!res.ok || !res.ends_at || !res.started_at) {
      // For already_active, we still want to hydrate local cache if server provided ends_at.
      if (res.ok === false && res.error === 'already_active' && res.ends_at) {
        await refreshFromServer();
      }
      return res as any;
    }

    // Cache ends_at immediately; no follow-up fetch needed.
    await writeCache(user.id, { startedAt: res.started_at, endsAt: res.ends_at, syncedAtMs: Date.now() });
    applyActiveFromEndsAt(res.started_at, res.ends_at);
    return res as any;
  }, [user?.id, applyActiveFromEndsAt, refreshFromServer]);

  const formatted = useMemo(() => {
    const total = Math.max(0, remainingSeconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [remainingSeconds]);

  return {
    loading,
    status,
    isActive,
    remainingSeconds,
    formattedRemaining: formatted,
    refresh: refreshFromServer,
    start,
    clearLocal,
  };
}

