import storage from '@/services/storage/storage';
import { getLikedYouPage, type LikedYouCard } from '@/services/feed/likedYouService';

type Persisted = { ids: string[]; updatedAtMs: number };
type Entry = { ids: Set<string>; updatedAtMs: number };

const STORAGE_KEY_PREFIX = 'liked_you_ids_v1:';
const cache = new Map<string, Entry>();
const inflightRefresh = new Map<string, Promise<void>>();
const subs = new Map<string, Set<(entry: Entry | null) => void>>();

function notify(userId: string) {
  const set = subs.get(userId);
  if (!set) return;
  const entry = cache.get(userId) ?? null;
  for (const cb of set) cb(entry);
}

function setEntry(userId: string, ids: Iterable<string>, updatedAtMs: number = Date.now()) {
  cache.set(userId, { ids: new Set(ids), updatedAtMs });
  notify(userId);
}

async function persistEntry(userId: string) {
  const entry = cache.get(userId);
  const key = STORAGE_KEY_PREFIX + userId;
  if (!entry) {
    await storage.delete(key);
    return;
  }
  const payload: Persisted = { ids: Array.from(entry.ids), updatedAtMs: entry.updatedAtMs };
  await storage.set(key, JSON.stringify(payload));
}

export function subscribeLikedYouIds(userId: string, cb: (entry: Entry | null) => void) {
  const set = subs.get(userId) ?? new Set();
  set.add(cb);
  subs.set(userId, set);
  // Immediately emit current state.
  cb(cache.get(userId) ?? null);
  return () => {
    const cur = subs.get(userId);
    if (!cur) return;
    cur.delete(cb);
    if (cur.size === 0) subs.delete(userId);
  };
}

export function hasLikedYouId(userId: string, candidateId: string): boolean {
  return cache.get(userId)?.ids.has(candidateId) ?? false;
}

export async function hydrateLikedYouIds(userId: string): Promise<void> {
  if (cache.has(userId)) return;
  const key = STORAGE_KEY_PREFIX + userId;
  const raw = await storage.getString(key);
  const s = typeof raw === 'string' ? raw : await raw;
  if (!s) return;
  try {
    const parsed = JSON.parse(s) as Persisted;
    if (!parsed?.ids || !Array.isArray(parsed.ids)) return;
    setEntry(userId, parsed.ids, parsed.updatedAtMs ?? Date.now());
  } catch {
    // ignore
  }
}

export async function refreshLikedYouIds(userId: string, limit: number = 200): Promise<void> {
  const existing = inflightRefresh.get(userId);
  if (existing) return existing;

  const p = (async () => {
    const { rows } = await getLikedYouPage(limit, null);
    setEntry(userId, rows.map((r) => r.liker_id), Date.now());
    await persistEntry(userId);
  })()
    .catch((e) => {
      console.error('[likedYouIdCache] refresh failed:', e);
    })
    .finally(() => {
      inflightRefresh.delete(userId);
    });

  inflightRefresh.set(userId, p);
  return p;
}

export async function mergeLikedYouIdsFromRows(userId: string, rows: LikedYouCard[]) {
  const existing = cache.get(userId)?.ids ?? new Set<string>();
  const merged = new Set(existing);
  for (const r of rows) merged.add(r.liker_id);
  setEntry(userId, merged, Date.now());
  await persistEntry(userId);
}

export async function clearLikedYouIds(userId: string) {
  cache.delete(userId);
  notify(userId);
  await storage.delete(STORAGE_KEY_PREFIX + userId);
}

