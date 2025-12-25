# Profile Live Gating

This document describes how profile live gating works and how to use it in queries.

## Overview

Users can browse onboarding and complete their profile, but they won't appear in other people's feeds until all their photos are approved.

## SQL Function: `is_user_live(user_id)`

Returns `true` only if:
1. At least 1 approved human photo exists (`bucket_type='human'` AND `status='approved'`)
2. For each dog the user has, at least 1 approved dog photo exists (`bucket_type='dog'` AND `dog_id` matches AND `status='approved'`)

### Usage in Queries

```sql
-- Example: Get all live users for feed
SELECT *
FROM profiles p
WHERE is_user_live(p.user_id) = true;

-- Example: Check specific user
SELECT is_user_live('user-uuid-here');
```

## Client-Side Usage

### Hook: `useUserLiveStatus()`

```tsx
import { useUserLiveStatus } from '@/hooks/useUserLiveStatus';

function MyComponent() {
  const { isLive, isLoading, error, refetch } = useUserLiveStatus();
  
  if (isLoading) return <Loading />;
  if (!isLive) return <NotLiveBanner />;
  return <LiveContent />;
}
```

### Service Function: `isUserLive(userId)`

```tsx
import { isUserLive } from '@/services/supabase/userService';

const live = await isUserLive(userId);
```

## UI Components

### ProfileLiveStatusBanner

Shows a banner indicating live status:
- ✅ Green banner: "Your profile is approved and live" (if live)
- ⚠️ Red banner: "One or more of your photos failed verification. Please fix your photos to go live." (if not live)
  - Clicking the banner navigates to `/(profile)/dogs` (photos upload page)

### Rejected Photos Display

Photo bucket components (`DogPhotoBucket`, `HumanPhotoBucket`) automatically:
- Show red border around rejected photos
- Display "❌ Rejected" badge
- Show `rejection_reason` text below rejected photos
- Show delete button (×) on all photos

## Feed/Matching Query Updates

When querying users for feeds or matching, filter by `is_user_live`:

```typescript
// Example: Get live users for feed
const { data: liveUsers } = await supabase
  .from('profiles')
  .select('*')
  .rpc('is_user_live', { check_user_id: supabase.raw('user_id') })
  .eq('is_live', true); // This requires a computed column or subquery

// Better approach: Use subquery
const { data: liveUsers } = await supabase
  .from('profiles')
  .select('*')
  .then(users => users.filter(user => isUserLive(user.id)));
```

Or use SQL RPC directly:

```sql
-- In a view or query
SELECT p.*
FROM profiles p
WHERE is_user_live(p.user_id) = true;
```

## Migration

Run the migration file:
- `scripts/supabase/migrations/004_is_user_live_function.sql`

This creates:
- `is_user_live(user_id UUID)` function
- Index on `photos(user_id, bucket_type, status)` for performance

