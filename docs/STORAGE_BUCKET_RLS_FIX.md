# Storage Bucket RLS Policy Fix

## Problem
Getting error: "new row violates row-level security policy" when uploading photos.

## Solution

The storage path format is: `users/{userId}/{bucketType}/{dogId-or-human}/{timestamp}_{random}.jpg`

The RLS policy needs to check that the path starts with `users/{auth.uid()}/`.

### Update Storage Bucket RLS Policy

Go to Supabase Dashboard → Storage → photos → Policies

**Update the INSERT policy:**

1. Edit the "Users can upload their own photos" policy
2. Change the policy definition to:

```sql
bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Note:** `storage.foldername(name)` splits the path by `/`. For path `users/{userId}/...`:
- `[0]` = `users`
- `[1]` = `userId` ← This is what we check

Alternatively, you can use a simpler approach that checks if the path starts with the user's ID:

```sql
bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'
```

### Quick Fix: Allow All Authenticated Users (Less Secure, For Dev)

If you want a quick fix for development, you can temporarily use:

```sql
bucket_id = 'photos' AND auth.role() = 'authenticated'
```

This allows any authenticated user to upload, but you should restrict it to their own folder for production.

