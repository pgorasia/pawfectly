# Per-Lane Feed State Refactor

## Overview

Refactored feed state management to maintain separate queues, cursors, and exhaustion flags for each lane (Match and Pals). This prevents losing progress when users switch between lanes.

## Problem

Previously, the feed used single state variables that were shared across lanes:
```typescript
const [profileQueue, setProfileQueue] = useState([]);
const [nextCursor, setNextCursor] = useState(null);
const [feedExhausted, setFeedExhausted] = useState(false);
```

When a user switched from Match to Pals, the queue would be cleared and reloaded. Switching back to Match would lose their place in the Match feed.

## Solution

Implemented per-lane state using Records keyed by lane:

```typescript
type Lane = 'pals' | 'match';

const [lane, setLane] = useState<Lane>(defaultLane);

const [queueByLane, setQueueByLane] = useState<Record<Lane, ProfileViewPayload[]>>({
  pals: [],
  match: [],
});

const [cursorByLane, setCursorByLane] = useState<Record<Lane, FeedCursor | null>>({
  pals: null,
  match: null,
});

const [exhaustedByLane, setExhaustedByLane] = useState<Record<Lane, boolean>>({
  pals: false,
  match: false,
});
```

## Changes Made

### 1. State Management

**Before:**
- Single `profileQueue` array
- Single `nextCursor` value
- Single `feedExhausted` boolean

**After:**
- `queueByLane` record with separate arrays per lane
- `cursorByLane` record with separate cursors per lane
- `exhaustedByLane` record with separate flags per lane

### 2. Load Feed Function

Updated `loadFeedPage` to take a `targetLane` parameter:

```typescript
const loadFeedPage = useCallback(
  async (targetLane: Lane, cursor: FeedCursor | null = null, append: boolean = false) => {
    const result = await getFeedPage(10, cursor, targetLane);
    
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
  },
  [user?.id]
);
```

### 3. Lane Switching

**Before:** Cleared queue and reloaded from scratch:
```typescript
const handleLaneSwitch = async (newLane) => {
  setProfileQueue([]);
  setCurrentProfile(null);
  const result = await getFeedPage(10, null, newLane);
  setProfileQueue(result.profiles);
};
```

**After:** Only loads if lane's queue is empty:
```typescript
const handleLaneSwitch = useCallback(async (newLane: Lane) => {
  if (newLane === lane) return;
  
  setLane(newLane);
  setCurrentProfile(null);
  setPendingUndoNew(null);
  
  // Only load if new lane's queue is empty
  if (queueByLane[newLane].length === 0 && !exhaustedByLane[newLane]) {
    await loadFeedPage(newLane, null, false);
  }
}, [lane, queueByLane, exhaustedByLane, loadFeedPage]);
```

### 4. Advance to Next

Updated to work with current lane's queue:

```typescript
const advanceToNext = useCallback(() => {
  setQueueByLane((prev) => {
    const currentQueue = prev[lane];
    const newQueue = currentQueue.slice(1);
    
    if (newQueue.length > 0) {
      setCurrentProfile(newQueue[0]);
    }
    
    // Auto-refill if queue is low
    const currentCursor = cursorByLane[lane];
    if (newQueue.length < 10 && currentCursor) {
      loadFeedPage(lane, currentCursor, true);
    }
    
    return { ...prev, [lane]: newQueue };
  });
}, [lane, cursorByLane, loadFeedPage]);
```

### 5. Undo Function

Updated to restore to the correct lane's queue:

```typescript
const handleUndo = useCallback(() => {
  const undoLane = pendingUndoNew.lane;
  
  setQueueByLane((prev) => {
    const currentQueue = prev[undoLane];
    // Put current profile back in queue, restore undone profile
    const finalQueue = currentProfile ? [currentProfile, ...rest] : rest;
    return { ...prev, [undoLane]: finalQueue };
  });
  
  setCurrentProfile(snapshot);
  setPendingUndoNew(null);
}, [pendingUndoNew, currentProfile]);
```

### 6. Empty State

Uses per-lane exhaustion flag:

```typescript
{exhaustedByLane[lane] && queueByLane[lane].length === 0 && !currentProfile ? (
  <View style={styles.emptyContainer}>
    <AppText>No more profiles</AppText>
  </View>
) : (...)}
```

## Benefits

1. **Preserves Progress**: Switching lanes doesn't lose your place
2. **Better UX**: Instant lane switching if queue is already loaded
3. **Reduced Load**: Doesn't re-fetch data unnecessarily
4. **Accurate State**: Each lane tracks its own exhaustion status

## Testing

### Test Scenarios

1. **Switch lanes with profiles:**
   - Load Match feed → see profiles
   - Switch to Pals → see different profiles
   - Switch back to Match → same profiles resume where left off

2. **Empty lane:**
   - Match has profiles, Pals is empty
   - Switch to Pals → sees "No more profiles"
   - Switch back to Match → resumes Match feed

3. **Undo across lanes:**
   - Reject profile in Match lane
   - Undo works (restores to Match queue)
   - Switch to Pals → undo state cleared

4. **Auto-refill:**
   - Swipe through 8 profiles in Match
   - Queue auto-refills when < 10 profiles remain
   - Switch to Pals → has separate queue that auto-refills independently

## API Integration

The backend RPCs already support per-lane queries:

```sql
-- Feed candidates RPC
get_feed_page(
  p_limit int,
  p_cursor_updated_at timestamptz,
  p_cursor_user_id uuid,
  p_lane text  -- 'match' or 'pals'
)

-- Dislike actions RPC
record_reject(
  p_target_id uuid,
  p_lane text,
  p_cross_lane_days int
)
```

Each lane's feed is independently filtered and ordered by the backend.

## Future Enhancements

- Persist queue state to storage (survive app restart)
- Pre-load both lanes on app start
- Lazy load lanes only when user visits them
- Add lane-specific filters (age, distance, etc.)
