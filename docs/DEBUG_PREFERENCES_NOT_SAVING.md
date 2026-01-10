# Debug: Preferences Not Saving

## Issue Report

User reports that when updating preferences or changing pals/match selection on the preferences screen:
1. Changes don't seem to save to the database
2. Changes don't reflect on the feed page

## Debugging Logs Added

I've added comprehensive logging to help diagnose the issue. Here's what to check:

### 1. Preferences Screen Logs

**When toggling Pals/Match:**
```
[PreferencesScreen] Toggling style: pawsome-pals -> New styles: ['pawsome-pals']
```

**When updating age/gender/distance:**
```
[PreferencesScreen] Updating preferences for pawsome-pals: {
  preferredGenders: ['any'],
  ageRange: { min: 25, max: 35 },
  distance: 50
}
```

**When auto-saving:**
```
[PreferencesScreen] Auto-saving preferences...
[PreferencesScreen] Auto-save successful
```

**If auto-save is skipped:**
```
[PreferencesScreen] Auto-save skipped: no user
[PreferencesScreen] Auto-save skipped: no unsaved changes
[PreferencesScreen] Auto-save skipped: no styles selected
```

### 2. Database Service Logs

**When saving to database:**
```
[OnboardingService] Updating preferences for user: [user-id]
[OnboardingService] Connection styles: ['pawsome-pals', 'pawfect-match']
[OnboardingService] Preferences: {
  'pawsome-pals': { preferredGenders: [...], ageRange: {...}, distance: 50 },
  'pawfect-match': { preferredGenders: [...], ageRange: {...}, distance: 25 }
}
[OnboardingService] Upserting preferences data: {
  user_id: '...',
  pals_enabled: true,
  match_enabled: true,
  pals_preferred_genders: [...],
  pals_age_min: 25,
  pals_age_max: 35,
  ...
}
[OnboardingService] Preferences updated successfully
```

### 3. Feed Screen Logs

**When preferences change and feed refreshes:**
```
[FeedScreen] Preferences changed, refreshing both lanes
[FeedScreen] Refreshing both lanes due to preference change
```

## Testing Steps

### Step 1: Check Auto-Save Triggers

1. Open preferences screen
2. Toggle a connection style (Pals or Match)
3. **Check console:** Should see "Toggling style" log
4. Navigate away or put app in background
5. **Check console:** Should see "Auto-saving preferences..." and "Auto-save successful"

**Expected Behavior:**
- Auto-save triggers when navigating away
- Auto-save triggers when app goes to background
- Auto-save triggers on unmount

**If Not Working:**
- Check if you see "Auto-save skipped" logs
- Check if `hasUnsavedChanges.current` is being set to `true`

### Step 2: Check Database Save

1. Make a change in preferences
2. Navigate away
3. **Check console:** Should see all OnboardingService logs
4. **Check Supabase:** Query the `preferences` table to verify data

**SQL to verify:**
```sql
SELECT * FROM preferences WHERE user_id = '[your-user-id]';
```

**Expected Fields:**
- `pals_enabled` (boolean)
- `match_enabled` (boolean)
- `pals_preferred_genders` (text[])
- `pals_age_min` (int)
- `pals_age_max` (int)
- `pals_distance_miles` (int)
- `match_preferred_genders` (text[])
- `match_age_min` (int)
- `match_age_max` (int)
- `match_distance_miles` (int)

### Step 3: Check Feed Refresh

1. Make a change in preferences
2. Navigate to feed screen
3. **Check console:** Should see "Preferences changed, refreshing both lanes"

**Expected Behavior:**
- Feed detects preference changes via `me.preferencesRaw` and `me.preferences`
- Feed clears both lane queues and reloads

**If Not Working:**
- Check if `updateMe()` is being called in preferences screen
- Check if `me.preferencesRaw` is being updated
- Check if the useEffect in feed screen is running

## Common Issues

### Issue 1: Auto-Save Not Triggering

**Symptom:** See "Auto-save skipped: no unsaved changes"

**Cause:** `hasUnsavedChanges.current` not being set to `true`

**Solution:** Check that `toggleStyle` and `handleUpdatePreferences` are setting the flag:
```typescript
hasUnsavedChanges.current = true;
```

### Issue 2: Database Save Fails

**Symptom:** See error in console after "Upserting preferences data"

**Possible Causes:**
- RLS policies blocking the update
- User not authenticated
- Invalid data format
- `user_id` conflict

**Debug:**
1. Check Supabase RLS policies for `preferences` table
2. Check if user is authenticated (`user?.id` exists)
3. Check error message for specifics

### Issue 3: Feed Doesn't Refresh

**Symptom:** No "Preferences changed" log in feed screen

**Possible Causes:**
- `updateMe()` not called in preferences screen
- `me.preferencesRaw` not updated
- Feed screen not mounted when preferences change

**Debug:**
1. Check if `updateMe()` is called with correct data:
   ```typescript
   updateMe({
     connectionStyles: selectedStyles,
     preferences: draft.preferences,
     preferencesRaw: {
       pals_enabled: selectedStyles.includes('pawsome-pals'),
       match_enabled: selectedStyles.includes('pawfect-match'),
     },
   });
   ```
2. Check if `me.preferencesRaw` changes after save
3. Navigate to feed after save to trigger detection

### Issue 4: MeContext Not Updating

**Symptom:** `updateMe()` called but `me` object doesn't change

**Possible Causes:**
- MeContext not properly updating
- Stale cache
- React state not updating

**Debug:**
1. Add log in MeContext's `updateMe` function
2. Check if the context value is being propagated
3. Force reload `me` data from database

## Quick Test Script

Run this in the preferences screen to verify the flow:

```typescript
// Add this temporarily to test
useEffect(() => {
  console.log('[DEBUG] Current state:', {
    selectedStyles,
    hasUnsavedChanges: hasUnsavedChanges.current,
    userId: user?.id,
    draftPreferences: draft.preferences,
  });
}, [selectedStyles, user?.id, draft.preferences]);
```

This will log the state every time it changes, helping you see if:
- Styles are being updated
- Unsaved changes flag is being set
- User ID is present
- Draft preferences are being populated

## Database Schema Check

Verify the `preferences` table exists with correct columns:

```sql
\d preferences

-- Expected columns:
-- user_id (uuid, primary key)
-- pals_enabled (boolean)
-- match_enabled (boolean)
-- pals_preferred_genders (text[])
-- pals_age_min (int)
-- pals_age_max (int)
-- pals_distance_miles (int)
-- match_preferred_genders (text[])
-- match_age_min (int)
-- match_age_max (int)
-- match_distance_miles (int)
-- created_at (timestamptz)
-- updated_at (timestamptz)
```

## Next Steps

1. **Run the app** and make a preference change
2. **Check console logs** for the patterns described above
3. **Identify where the flow breaks** (toggle -> auto-save -> database -> feed)
4. **Report findings:**
   - Which logs appear?
   - Which logs are missing?
   - Any error messages?
   - What's in the database after the change?

Based on the logs, we can pinpoint the exact issue and fix it.
