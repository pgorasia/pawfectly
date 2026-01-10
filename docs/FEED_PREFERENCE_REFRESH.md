# Feed Preference Refresh

## Overview

The feed automatically refreshes both lanes (Match and Pals) when user preferences change. This ensures that profile eligibility changes are reflected immediately, such as when mutual dating eligibility changes allowing a profile to appear in Pals right away.

## Problem Solved

### Before
- User changes preferences (enables Pals, adjusts age range, widens distance)
- Feed doesn't update until manual refresh
- Profiles that are now eligible don't appear until user force-refreshes
- Switching lanes shows stale data

### After
- Preference changes trigger automatic refresh of both lanes
- Active lane refetches immediately (user sees new profiles right away)
- Other lane prefetches in background (ready when user switches)
- Ensures eligibility changes are reflected instantly

## Implementation

### 1. Refresh Both Lanes Function

Added `refreshBothLanes` callback in feed screen:

```typescript
const refreshBothLanes = useCallback(async () => {
  console.log('[FeedScreen] Refreshing both lanes due to preference change');
  
  // Clear both lanes
  setCursorByLane({ pals: null, match: null });
  setQueueByLane({ pals: [], match: [] });
  setCurrentProfile(null);
  setExhaustedByLane({ pals: false, match: false });
  
  // Clear pending undo (preferences changed, old undo is stale)
  setPendingUndoNew(null);
  
  // Refetch active lane
  await loadFeedPage(lane, null, false);
  
  // Optionally prefetch the other lane (if enabled)
  const otherLane: Lane = lane === 'match' ? 'pals' : 'match';
  const otherLaneEnabled = otherLane === 'pals' 
    ? me.preferencesRaw.pals_enabled 
    : me.preferencesRaw.match_enabled;
  
  if (otherLaneEnabled) {
    // Prefetch in background without blocking
    loadFeedPage(otherLane, null, false).catch((error) => {
      console.error(`[FeedScreen] Failed to prefetch ${otherLane} lane:`, error);
    });
  }
}, [lane, loadFeedPage, me.preferencesRaw]);
```

### 2. Preference Change Detection

Added effect to watch for preference changes:

```typescript
// Track previous preferences to detect changes (including filters)
const prevPreferencesRef = useRef<string | null>(null);

// Refresh both lanes when preferences change
useEffect(() => {
  // Serialize all relevant preferences (enablement + filters)
  const currentPrefsStr = JSON.stringify({
    raw: me.preferencesRaw,
    pals: me.preferences['pawsome-pals'],
    match: me.preferences['pawfect-match'],
  });
  
  const prevPrefsStr = prevPreferencesRef.current;
  
  // Skip on initial mount
  if (!prevPrefsStr) {
    prevPreferencesRef.current = currentPrefsStr;
    return;
  }
  
  // Check if preferences actually changed
  if (currentPrefsStr !== prevPrefsStr && user?.id && !loading) {
    console.log('[FeedScreen] Preferences changed, refreshing both lanes');
    refreshBothLanes();
    prevPreferencesRef.current = currentPrefsStr;
    lastRefreshTime.current = Date.now();
  }
}, [me.preferencesRaw, me.preferences, user?.id, loading, refreshBothLanes]);
```

### 3. Preferences Screen Updates

Updated to include `preferencesRaw` in MeContext updates:

```typescript
// In autoSave and handleSave:
updateMe({
  connectionStyles: selectedStyles,
  preferences: draft.preferences,
  preferencesRaw: {
    pals_enabled: selectedStyles.includes('pawsome-pals'),
    match_enabled: selectedStyles.includes('pawfect-match'),
  },
});
```

## What Triggers Refresh

Refresh is triggered when ANY of these change:

### Enablement
- Enabling/disabling Pawsome Pals
- Enabling/disabling Pawfect Match

### Pals Filters
- Preferred genders
- Age range (min/max)
- Distance radius

### Match Filters
- Preferred genders
- Age range (min/max)
- Distance radius

## Behavior Details

### Active Lane
- Clears immediately
- Refetches first page
- Shows loading state
- User sees new profiles right away

### Other Lane (Background Prefetch)
- Clears queue/cursor
- Fetches first page in background
- Does NOT show loading state
- Ready when user switches lanes
- Fails silently if error

### Pending Undo
- Cleared on preference change
- Prevents undoing with stale data
- User must refresh manually if they had pending undo

### Timing
- Only triggers after initial mount
- Requires actual change (not just re-render)
- Respects loading state (won't trigger while loading)
- Updates `lastRefreshTime` to prevent focus refresh

## User Flow Examples

### Example 1: Enable Pals
1. User is on Match lane
2. Goes to Preferences
3. Enables "Pawsome Pals"
4. Saves and returns to feed
5. **Match lane** shows fresh profiles
6. **Pals lane** prefetched in background
7. Segmented control appears
8. User switches to Pals → instant (already loaded)

### Example 2: Widen Distance
1. User exhausts Pals feed
2. Taps "Widen radius" button
3. Increases distance from 25mi to 50mi
4. Returns to feed
5. **Pals lane** shows new profiles within 50mi
6. **Match lane** also refreshed (may have new profiles)

### Example 3: Adjust Age Range
1. User is on Match lane viewing profiles
2. Goes to Preferences
3. Changes age range from 25-35 to 21-40
4. Saves preferences
5. **Match lane** refreshes with new age range
6. Current profile cleared (might be outside new range)
7. Shows profiles aged 21-40

### Example 4: Change Gender Preferences
1. User has "Male" selected in Pals
2. Changes to "Any"
3. Returns to feed
4. **Pals lane** now includes all genders
5. Much larger pool of profiles
6. Previous profiles may reappear

## Edge Cases Handled

### No Changes
- If user opens preferences but doesn't change anything
- No refresh triggered (serialized values are identical)

### Loading State
- If feed is already loading when preferences change
- Refresh waits until loading completes

### Not Authenticated
- If user somehow not authenticated
- Refresh skipped (requires user?.id)

### Initial Mount
- First render doesn't trigger refresh
- Only subsequent changes trigger

### Rapid Changes
- Multiple preference changes in quick succession
- Each change triggers refresh (no debounce)
- Last change wins

### Disabled Lane
- If other lane is disabled
- Prefetch skipped for that lane
- Only active lane refreshed

## Performance Considerations

### Network Efficiency
- Prefetch is background/non-blocking
- Won't delay showing active lane
- Reduces wait time when switching lanes

### Memory
- Old queues cleared immediately
- Prevents memory leak from stale data
- Refs track minimal data

### User Experience
- Immediate feedback on active lane
- Smooth experience when switching
- No stale data confusion

## Testing

### Test Cases

1. **Enable/Disable Lanes:**
   - ✓ Enable Pals → both lanes refresh
   - ✓ Disable Match → clears Match queue
   - ✓ Segmented control appears/disappears

2. **Distance Changes:**
   - ✓ Widen distance → new profiles appear
   - ✓ Narrow distance → queue refreshes
   - ✓ Both lanes affected

3. **Age Changes:**
   - ✓ Expand range → more profiles
   - ✓ Narrow range → queue refreshes
   - ✓ Profiles outside range removed

4. **Gender Changes:**
   - ✓ Add genders → more profiles
   - ✓ Remove genders → fewer profiles
   - ✓ Switch to "Any" → all genders

5. **Multiple Changes:**
   - ✓ Change distance + age + gender
   - ✓ All changes reflected
   - ✓ Single refresh triggered

6. **Edge Cases:**
   - ✓ Open/close preferences without changes → no refresh
   - ✓ While loading → waits for completion
   - ✓ Not authenticated → skips refresh

## Future Enhancements

### Debouncing
Could add debounce to prevent excessive refreshes:
```typescript
const debouncedRefresh = useDebounce(refreshBothLanes, 1000);
```

### Optimistic Updates
Could show expected profiles before server responds:
```typescript
// Filter existing queue based on new preferences
const filteredQueue = applyFilters(queueByLane[lane], newPreferences);
setQueueByLane(prev => ({ ...prev, [lane]: filteredQueue }));
```

### Partial Refresh
Could fetch only new profiles instead of clearing:
```typescript
// Fetch profiles that match new filters but weren't in old filters
const additionalProfiles = await fetchDelta(oldPrefs, newPrefs);
```

### Cache Invalidation
Could invalidate specific profiles:
```typescript
// Remove profiles that no longer match
const validProfiles = queueByLane[lane].filter(p => matchesFilters(p, newPrefs));
```

## Analytics

Track preference changes and refreshes:
- `feed_preference_refresh_triggered`
- `feed_preference_refresh_completed`
- `feed_preference_refresh_failed`

Dimensions:
- `changed_field` (distance, age, gender, enablement)
- `active_lane` (match, pals)
- `had_profiles` (true/false)

## Notes

- Refresh is automatic and transparent
- No user action required beyond saving preferences
- Ensures data consistency across all lanes
- Critical for mutual dating eligibility changes
