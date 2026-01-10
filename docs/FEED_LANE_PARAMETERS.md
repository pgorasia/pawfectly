# Feed Service Lane Parameters

## Overview

All feed-related service functions now properly pass the `lane` parameter to their respective database RPCs. This ensures that Match and Pals feeds remain separate and correctly filtered.

## Functions with Lane Parameter

### ✅ Feed Fetching

**`getFeedQueue(limit, cursor, activeLane)`**
- RPC: `get_feed_candidates`
- Passes: `p_lane: activeLane`
- Returns: Candidate IDs with cursor

**`getFeedPage(limit, cursor, activeLane)`**
- RPC: `get_feed_page`
- Passes: `p_lane: activeLane`
- Returns: Full profile payloads with cursor

**`getFeedBasic(limit, activeLane)` (deprecated)**
- RPC: `get_feed_candidates`
- Passes: `p_lane: activeLane`
- Default: `'match'`
- Note: Kept for backward compatibility

### ✅ Swipe Actions

**`recordReject(candidateId, activeLane, crossLaneDays)`**
- RPC: `record_reject`
- Passes: `p_lane: activeLane`, `p_cross_lane_days`
- Records permanent reject (hides across lanes for N days)

**`recordSkip(candidateId, activeLane, skipDays)`**
- RPC: `record_skip`
- Passes: `p_lane: activeLane`, `p_skip_days`
- Records temporary skip (hides in this lane for N days)

**`submitSwipe(candidateId, 'accept')` (legacy)**
- RPC: `submit_swipe`
- Does NOT pass lane (accepts are lane-agnostic)
- Only used for 'accept' action

### ✅ Undo Actions

**`undoLastDislike(activeLane)`**
- RPC: `undo_last_dislike`
- Passes: `p_lane: activeLane`
- Returns: Undone target ID and action

**`resetDislikes(lanes)`**
- RPC: `reset_dislikes`
- Passes: `p_lanes: lanes[]`
- Resets dislikes for selected lanes

## Functions Without Lane Parameter

These functions don't need a lane parameter because they operate on specific profiles or connections:

**`getProfileView(candidateId)`**
- RPC: `get_profile_view`
- Views a specific profile (lane-independent)

**`sendConnectionRequest(candidateId, sourceType, sourceRefId, message)`**
- RPC: `send_connection_request`
- Sends like/connection (lane-independent)

## Type Definition

```typescript
type Lane = 'pals' | 'match';
```

## Backend RPC Signatures

### get_feed_candidates
```sql
CREATE FUNCTION get_feed_candidates(
  p_limit int,
  p_cursor_updated_at timestamptz,
  p_cursor_user_id uuid,
  p_lane text  -- 'match' or 'pals'
)
```

### get_feed_page
```sql
CREATE FUNCTION get_feed_page(
  p_limit int,
  p_cursor_updated_at timestamptz,
  p_cursor_user_id uuid,
  p_lane text  -- 'match' or 'pals'
)
```

### record_reject
```sql
CREATE FUNCTION record_reject(
  p_target_id uuid,
  p_lane text,  -- 'match' or 'pals'
  p_cross_lane_days int
)
```

### record_skip
```sql
CREATE FUNCTION record_skip(
  p_target_id uuid,
  p_lane text,  -- 'match' or 'pals'
  p_skip_days int
)
```

### undo_last_dislike
```sql
CREATE FUNCTION undo_last_dislike(
  p_lane text  -- 'match' or 'pals'
)
```

## Usage Example

```typescript
// Feed screen
const lane: Lane = 'match';

// Fetch feed for current lane
const { profiles, nextCursor } = await getFeedPage(10, null, lane);

// Record reject in current lane
await recordReject(candidateId, lane, 30);

// Undo last action in current lane
const undoResult = await undoLastDislike(lane);
```

## Testing Checklist

- [x] Match lane shows only Match profiles
- [x] Pals lane shows only Pals profiles
- [x] Rejecting in Match doesn't appear in Pals (for cross_lane_days)
- [x] Skipping in Match only hides in Match
- [x] Undo restores to correct lane
- [x] Switching lanes preserves separate queues
- [x] Empty states are per-lane

## Migration Notes

When adding new feed-related RPCs:
1. Always accept `p_lane text` parameter
2. Use `p_lane` in WHERE clauses for filtering
3. Store lane in swipes/dislikes tables for analytics
4. Update TypeScript wrapper to pass `activeLane` parameter
