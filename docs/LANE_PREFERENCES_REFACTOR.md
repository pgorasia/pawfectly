# Lane Enablement Refactor: Use Preferences Instead of ConnectionStyles

## Overview

Refactored lane (match/pals) enablement to use preference flags (`pals_enabled`, `match_enabled`) directly from the database instead of deriving from `connectionStyles` array.

## Changes

### 1. MeContext Updates (`contexts/MeContext.tsx`)

**Added `preferencesRaw` field:**

```typescript
export interface MeData {
  // ... existing fields
  preferencesRaw: {
    pals_enabled: boolean;
    match_enabled: boolean;
  };
}
```

**Updated `loadFromDatabase`:**
- Extracts `pals_enabled` and `match_enabled` from database preferences
- Stores them in `preferencesRaw` for direct access
- Handles null preferences with safe defaults

### 2. Feed Screen Updates (`app/(tabs)/index.tsx`)

**Lane determination logic:**

```typescript
const { visibleTabs, defaultLane } = useMemo(() => {
  const prefs = me.preferencesRaw;
  const hasPals = prefs.pals_enabled;
  const hasMatch = prefs.match_enabled;
  
  const tabs: ('match' | 'pals')[] = [
    ...(hasMatch ? ['match' as const] : []),
    ...(hasPals ? ['pals' as const] : []),
  ];
  
  const defaultTab: 'match' | 'pals' = hasMatch ? 'match' : 'pals';
  
  return { visibleTabs: tabs, defaultLane: defaultTab };
}, [me.preferencesRaw]);
```

**Active lane state:**
- Changed from computed `const` to state variable
- Allows user to switch between lanes
- Auto-updates when preferences change

**New features:**

1. **Segmented Control** - Shows when both lanes enabled:
   ```
   [ Match | Pals ]
   ```
   
2. **Lane Switching Handler**:
   - Clears current feed
   - Loads feed for new lane
   - Clears pending undo when switching

3. **UI Rules**:
   - `visibleTabs.length === 2` → Show segmented control
   - `visibleTabs.length === 1` → Hide segmented control
   - Default selected tab: Match (if enabled)

### 3. Messages Screen Updates (`app/(tabs)/messages.tsx`)

**Updated lane detection:**

```typescript
const hasPawsomePals = me.preferencesRaw.pals_enabled;
const hasPawfectMatch = me.preferencesRaw.match_enabled;
```

**Preference reconciliation:**
- Updated to also sync `preferencesRaw` when fetching from database
- Ensures consistency across context updates

## Benefits

1. **Direct Access**: No need to check array membership (`includes()`)
2. **Type Safety**: Boolean flags are clearer than array strings
3. **Performance**: Simple boolean checks vs array searches
4. **Consistency**: Single source of truth from database

## API Contract

The `load_me()` RPC function already returns:

```json
{
  "preferences": {
    "pals_enabled": true,
    "match_enabled": false
  }
}
```

This data flows through:
1. `loadMe()` → returns `MeData`
2. `loadBootstrap()` → returns preferences via `select('*')`
3. `MeContext.loadFromDatabase()` → extracts flags into `preferencesRaw`

## Testing

### Verify Lane Switching

1. **Both lanes enabled:**
   - Segmented control should show
   - Can switch between Match and Pals
   - Feed reloads on switch

2. **One lane enabled:**
   - Segmented control hidden
   - Shows only enabled lane

3. **Preference changes:**
   - Disabling current lane switches to other lane
   - Enabling second lane shows segmented control

### Edge Cases

- No preferences set → defaults to false/false
- Null preferences → handled gracefully
- Switching lanes clears pending undo
- Feed refreshes correctly per lane

## Future Enhancements

Can now easily add:
- Per-lane filters (age, distance, etc.)
- Per-lane feed algorithms
- Analytics by lane
- Premium lane features
