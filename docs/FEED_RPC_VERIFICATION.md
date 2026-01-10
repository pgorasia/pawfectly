# Feed RPC Verification

## Overview

This document verifies that the dual-lane feed implementation uses the correct RPC functions with proper lane parameters.

## ✅ Current Implementation

### Feed Screen Uses `getFeedPage`

**File:** `app/(tabs)/index.tsx`

```typescript
import { 
  getFeedPage,  // ✅ Using the preferred function
  submitSwipe, 
  recordReject,
  recordSkip,
  sendConnectionRequest,
  undoLastDislike,
  type FeedCursor 
} from '@/services/feed/feedService';

// Load feed page for a specific lane
const loadFeedPage = useCallback(
  async (targetLane: Lane, cursor: FeedCursor | null = null, append: boolean = false) => {
    if (!user?.id) return;

    try {
      const result = await getFeedPage(10, cursor, targetLane);  // ✅ Passes lane
      
      // Update the specific lane's state
      setQueueByLane((prev) => ({
        ...prev,
        [targetLane]: append ? [...prev[targetLane], ...result.profiles] : result.profiles,
      }));
      
      setCursorByLane((prev) => ({
        ...prev,
        [targetLane]: result.nextCursor,
      }));
      
      setExhaustedByLane((prev) => ({
        ...prev,
        [targetLane]: result.profiles.length === 0,
      }));
    } catch (error) {
      console.error('[FeedScreen] Failed to load feed page:', error);
    }
  },
  [user?.id]
);
```

### `getFeedPage` Implementation

**File:** `services/feed/feedService.ts`

```typescript
export async function getFeedPage(
  limit: number = 10,
  cursor: FeedCursor | null = null,
  activeLane: 'pals' | 'match' = 'match'  // ✅ Lane parameter
): Promise<{ profiles: ProfileViewPayload[]; nextCursor: FeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_feed_page', {
    p_limit: limit,
    p_cursor_updated_at: cursor?.updated_at ?? null,
    p_cursor_user_id: cursor?.user_id ?? null,
    p_lane: activeLane,  // ✅ Passes p_lane to RPC
  });

  if (error) {
    console.error('[feedService] Failed to get feed page:', error);
    throw new Error(`Failed to get feed page: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { profiles: [], nextCursor: null };
  }

  // Each row: { profile: <json>, cursor_updated_at, cursor_user_id }
  const profiles = data
    .map((row: any) => row.profile)
    .filter(Boolean) as ProfileViewPayload[];

  const lastRow = data[data.length - 1];
  const nextCursor: FeedCursor | null = lastRow
    ? {
        updated_at: lastRow.cursor_updated_at,
        user_id: lastRow.cursor_user_id,
      }
    : null;

  return { profiles, nextCursor };
}
```

## ✅ No Usage of `getFeedBasic`

**Verification:**
- Searched all `.tsx` files: ❌ No matches found
- `getFeedBasic` is marked `@deprecated` in service file
- Only exists for backward compatibility with old code
- **Not used by dual-lane feed implementation**

## Function Comparison

### ❌ `getFeedBasic` (Deprecated)
```typescript
// OLD - Don't use for dual-lane feed
export async function getFeedBasic(
  limit: number = 20,
  activeLane: 'pals' | 'match' = 'match'
): Promise<FeedBasicCandidate[]> {
  const { data, error } = await supabase.rpc('get_feed_candidates', {
    p_limit: limit,
    p_cursor_updated_at: null,
    p_cursor_user_id: null,
    p_lane: activeLane,
  });
  // Returns basic candidate info only
}
```

**Issues:**
- Uses `get_feed_candidates` (IDs only)
- No cursor-based pagination support
- Returns minimal data (candidate_id, name, city, dog_name)
- Requires additional queries for full profiles

### ✅ `getFeedPage` (Current)
```typescript
// CURRENT - Used by dual-lane feed
export async function getFeedPage(
  limit: number = 10,
  cursor: FeedCursor | null = null,
  activeLane: 'pals' | 'match' = 'match'
): Promise<{ profiles: ProfileViewPayload[]; nextCursor: FeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_feed_page', {
    p_limit: limit,
    p_cursor_updated_at: cursor?.updated_at ?? null,
    p_cursor_user_id: cursor?.user_id ?? null,
    p_lane: activeLane,
  });
  // Returns full profile payloads with all data
}
```

**Advantages:**
- Uses `get_feed_page` (full profiles)
- Cursor-based pagination support
- Returns complete profile data in one call
- Includes dogs, photos, prompts, compatibility
- More efficient (fewer queries)

### ✅ `getFeedQueue` (Alternative)
```typescript
// ALTERNATIVE - Can be used for ID-only queuing
export async function getFeedQueue(
  limit: number = 10,
  cursor: FeedCursor | null = null,
  activeLane: 'pals' | 'match' = 'match'
): Promise<{ candidateIds: string[]; nextCursor: FeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_feed_candidates', {
    p_limit: limit,
    p_cursor_updated_at: cursor?.updated_at ?? null,
    p_cursor_user_id: cursor?.user_id ?? null,
    p_lane: activeLane,
  });
  // Returns IDs with cursor support
}
```

**Use Case:**
- When you only need IDs first
- Fetch full profiles on-demand
- Can reduce initial load time
- Good for pre-fetching next batch

## Backend RPC Functions

### `get_feed_page` (Used)
```sql
CREATE FUNCTION get_feed_page(
  p_limit int,
  p_cursor_updated_at timestamptz,
  p_cursor_user_id uuid,
  p_lane text  -- 'match' or 'pals'
)
RETURNS TABLE(
  profile jsonb,
  cursor_updated_at timestamptz,
  cursor_user_id uuid
)
```

Returns full profile JSON payload including:
- Candidate info (name, city, bio)
- Dogs (all active dogs with details)
- Photos (all approved photos)
- Prompts (dog prompt answers)
- Compatibility scores

### `get_feed_candidates` (Alternative)
```sql
CREATE FUNCTION get_feed_candidates(
  p_limit int,
  p_cursor_updated_at timestamptz,
  p_cursor_user_id uuid,
  p_lane text  -- 'match' or 'pals'
)
RETURNS TABLE(
  candidate_id uuid,
  human_name text,
  city text,
  dog_name text,
  hero_photo_storage_path text,
  hero_photo_bucket_type text,
  hero_photo_id uuid,
  cursor_updated_at timestamptz,
  cursor_user_id uuid
)
```

Returns minimal candidate info:
- Just IDs and basic fields
- Requires follow-up queries for full data
- Lighter initial payload

## Verification Checklist

- [x] Feed screen uses `getFeedPage`
- [x] `getFeedPage` passes `activeLane` parameter
- [x] `getFeedPage` calls `get_feed_page` RPC with `p_lane`
- [x] No usage of `getFeedBasic` in feed screen
- [x] Cursor-based pagination implemented
- [x] Per-lane state management
- [x] Both lanes can be refreshed independently

## Testing

### Verify Lane Parameter
```typescript
// In browser console or React DevTools
// Check network tab for RPC calls
// Should see: get_feed_page({ p_lane: 'match', ... })
// Should see: get_feed_page({ p_lane: 'pals', ... })
```

### Verify No `get_feed_basic` Calls
```sql
-- In Supabase dashboard, check function usage stats
-- get_feed_basic should have 0 recent calls
-- get_feed_page should have active usage
```

## Migration Path

If old code still uses `getFeedBasic`:

### Step 1: Replace Import
```typescript
// OLD
import { getFeedBasic } from '@/services/feed/feedService';

// NEW
import { getFeedPage } from '@/services/feed/feedService';
```

### Step 2: Update Function Call
```typescript
// OLD
const candidates = await getFeedBasic(20, activeLane);

// NEW
const { profiles, nextCursor } = await getFeedPage(10, null, activeLane);
```

### Step 3: Update State
```typescript
// OLD - basic candidates
const [candidates, setCandidates] = useState<FeedBasicCandidate[]>([]);

// NEW - full profiles
const [profiles, setProfiles] = useState<ProfileViewPayload[]>([]);
const [cursor, setCursor] = useState<FeedCursor | null>(null);
```

## Conclusion

✅ **Current Implementation is Correct:**
- Uses `getFeedPage` with `p_lane` parameter
- No usage of deprecated `getFeedBasic`
- Proper per-lane state management
- Efficient single-query profile loading

✅ **Future-Proof:**
- Can easily add per-lane filters
- Supports efficient pagination
- Ready for additional lanes if needed
- Clean separation of concerns

❌ **Do Not Use:**
- `getFeedBasic` - deprecated, less efficient
- Direct RPC calls without lane parameter
- Shared state across lanes
