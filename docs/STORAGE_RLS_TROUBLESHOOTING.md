# Storage RLS Policy Troubleshooting

## Problem: "new row violates row-level security policy" when uploading

If you're still getting this error after setting up policies, try these steps:

## Step 1: Check if bucket exists and RLS is enabled

1. Go to Supabase Dashboard → Storage
2. Verify the `photos` bucket exists
3. Click on the bucket and check that it's PUBLIC (for now)

## Step 2: Run SQL Migration (Recommended)

**IMPORTANT:** Do NOT try to `ALTER TABLE storage.objects` - it's a system table and you don't have permissions. RLS is already enabled by default.

Instead of using the Dashboard UI, run the SQL directly:

### Step 2A: Run Simple Migration First (Migration 008)

Run this SQL in Supabase SQL Editor to test basic functionality:

```sql
-- See: scripts/supabase/migrations/008_storage_policies_final.sql
```

This allows any authenticated user to upload. If this works, proceed to Step 2B.

### Step 2B: Add Folder Restrictions (Migration 009)

After verifying Step 2A works, run this to restrict uploads to user's own folder:

```sql
-- See: scripts/supabase/migrations/009_storage_policies_restricted.sql
```

This restricts uploads to paths starting with `users/{userId}/`.

## Step 3: Verify Policies Were Created

Run this query to check if policies exist:

```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%photos%';
```

You should see 4 policies:
- Users can upload their own photos (INSERT)
- Public read access (SELECT)
- Users can update their own photos (UPDATE)
- Users can delete their own photos (DELETE)

## Step 4: Test the Policy Directly

Test if the policy works by checking what the current user can see:

```sql
-- Check current user ID
SELECT auth.uid();

-- Check if a test path would match
SELECT 
  'users/' || auth.uid()::text || '/dog/test.jpg' LIKE 'users/' || auth.uid()::text || '/%' AS should_match;
```

## Step 5: Verify Policies Were Created

Check if policies exist by running:

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%photos%';
```

You should see policies for INSERT, SELECT, UPDATE, and DELETE operations.

## Step 6: Check Storage Path Format

Verify the path being generated matches the expected format:

The code generates: `users/{userId}/{bucketType}/{dogId-or-human}/{timestamp}_{random}.jpg`

Example: `users/123e4567-e89b-12d3-a456-426614174000/human/human/1234567890_abc123.jpg`

Make sure:
- `userId` is a valid UUID
- Path starts with `users/`
- User is authenticated (`auth.uid()` returns a value)

## Step 7: Verify User Authentication

Make sure the user is actually authenticated when uploading:

```typescript
// In your code, before upload, check:
const { data: { user } } = await supabase.auth.getUser();
console.log('User ID:', user?.id); // Should not be null
```

If `user` is null, the upload will fail because `auth.uid()` will be null in the policy.

## Common Issues

1. **Policy not applied**: Policies created via Dashboard might not have correct syntax. Use SQL migrations instead.

2. **Wrong bucket name**: Make sure bucket is named exactly `photos` (lowercase).

3. **User not authenticated**: `auth.uid()` returns null if user isn't logged in.

4. **Path format mismatch**: Policy expects `users/{userId}/...` - verify the path matches.

5. **RLS not enabled**: Storage RLS must be enabled on `storage.objects` table.

