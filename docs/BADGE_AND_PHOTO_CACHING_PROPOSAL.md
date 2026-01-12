# Badge and Photo Caching Proposal

## Issues Identified

1. **My Badges tab refreshes on every tab switch** - loads fresh data from DB every time
2. **Photos tab shows loading delay** - loads fresh data from DB every time  
3. **photo_with_dog badge not stored in trust_badges** - currently computed on-the-fly

## Current Architecture

### My Pack (Smooth - uses caching)
- Uses `useMe()` context which loads data once at app initialization
- Data is cached in `MeContext` state
- Updates are optimistic (immediate UI update, then sync to DB)
- No re-fetch on tab switches

### My Badges (Problem - no caching)
- Calls `getBadgeStatuses()` on every component mount
- Fresh DB queries every time
- No caching mechanism

### Photos (Problem - no caching)  
- Uses `usePhotoBuckets` hook which loads fresh from DB
- Shows loading state on every visit

## Proposed Solutions

### Option 1: Add Badges to MeContext (Recommended)

**Pros:**
- Consistent with existing architecture (My Pack pattern)
- Badges load once with other "me" data
- Simple to implement
- Can update optimistically

**Cons:**
- MeContext becomes slightly larger
- Need to refetch when badges might change (e.g., after photo upload)

**Implementation:**
```typescript
// MeContext.tsx
export interface MeData {
  // ... existing fields
  badges: BadgeStatus[];  // Add badges array
}

// Load badges when loading "me" data
// Update badges optimistically when earned
```

### Option 2: Create Separate BadgeContext

**Pros:**
- Keeps MeContext smaller
- Can be used independently
- Clear separation of concerns

**Cons:**
- More boilerplate
- Another context to manage
- Need coordination between contexts

### Option 3: Cache Badges in Component State with React Query / SWR

**Pros:**
- Industry-standard caching
- Built-in stale-while-revalidate
- Easy cache invalidation

**Cons:**
- Adds dependency
- More complex than needed for simple case
- Overkill for this use case

## Recommendation: Option 1 + Badge Storage Fix

### 1. Add Badges to MeContext
- Load badges when loading "me" data
- Cache in MeContext state
- Update optimistically when badges are earned
- Invalidate cache when photos are uploaded/deleted

### 2. Store photo_with_dog badge in trust_badges
- Create/update badge entry when user uploads photo with dog+human
- Use database trigger or service function to auto-award badge
- This matches the pattern used for selfie_verified

### 3. Photos Caching
- Photos are already loaded via `usePhotoBuckets` hook
- Can cache photo list in MeContext or use React.memo on photo components
- For MVP, the slight delay is acceptable if we fix badges first

## Implementation Plan

1. **Add badges to MeContext** ✅
   - Extend MeData interface
   - Load badges in bootstrap/loadMe
   - Add updateBadges function

2. **Create badge entry for photo_with_dog** ✅
   - Add trigger/function to award badge when photo is approved with contains_dog=true AND contains_human=true
   - Or check and award in photo approval flow

3. **Update MyBadgesTab to use MeContext** ✅
   - Remove useEffect loading
   - Use badges from useMe()
   - Show loading only if meLoaded is false

4. **Optional: Cache photos** (lower priority)
   - Can add to MeContext later if needed
   - Or optimize usePhotoBuckets hook

## Badge Storage Decision

**Decision: Use `badge_type` column (current design) ✅**

We decided to use `badge_type` as a column with values like:
- `'email_verified'`
- `'photo_with_dog'`
- `'selfie_verified'`

This is better than separate columns because:
- Flexible - easy to add new badge types
- Simple schema
- Easy to query all badges
- Metadata JSONB column for badge-specific data

**Issue:** We're not creating entries for `photo_with_dog` badge even though user earns it.

**Solution:** Create badge entry in `trust_badges` when:
- Photo is approved with `contains_dog=true` AND `contains_human=true`
- User doesn't already have this badge

Can use:
- Database trigger on photo approval
- Or check in photo approval service/edge function
