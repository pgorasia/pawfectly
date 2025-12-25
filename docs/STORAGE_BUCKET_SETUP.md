# Storage Bucket Setup: photos

## Overview
This document provides step-by-step instructions to create the `photos` storage bucket in Supabase and configure RLS policies.

**Bucket Configuration:**
- Name: `photos`
- Visibility: **PUBLIC** (for dev - will be private later)
- File size limit: 10MB
- Allowed MIME types: image/jpeg, image/png, image/webp

---

## Step 1: Create Storage Bucket (Dashboard)

### Manual Steps:

1. **Open Supabase Dashboard**
   - Go to your project: https://app.supabase.com/project/[your-project-id]

2. **Navigate to Storage**
   - Click **Storage** in the left sidebar (📦 icon)
   - You'll see the Storage page with any existing buckets

3. **Create New Bucket**
   - Click the **"New bucket"** button (top right)
   - A modal will appear

4. **Configure Bucket**
   - **Name:** `photos` (exact, case-sensitive)
   - **Public bucket:** Toggle **ON** (✅) - This makes the bucket public for dev
   - **File size limit:** `10485760` (10MB in bytes) - Optional, leave blank for no limit
   - **Allowed MIME types:** Leave blank (or add: `image/jpeg,image/png,image/webp`)

5. **Create Bucket**
   - Click **"Create bucket"** button
   - The bucket should now appear in your Storage list

---

## Step 2: Storage Bucket RLS Policies (Dashboard)

Since the bucket is **PUBLIC**, we still want some basic RLS policies for write operations.

### Navigate to Policies:
1. Click on the **`photos`** bucket in the Storage list
2. Click the **"Policies"** tab
3. You'll see a list of policies (initially empty)

### Policy 1: Allow authenticated users to upload (INSERT)

1. Click **"New policy"**
2. Select **"Create a policy from scratch"**
3. Configure:
   - **Policy name:** `Users can upload their own photos`
   - **Allowed operation:** `INSERT`
   - **Policy definition:** Copy/paste this:
     ```sql
     bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
     ```
     Alternative (simpler, recommended): 
     ```sql
     bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'
     ```
   - **Description:** Allows authenticated users to upload photos to their own user_id folder

4. Click **"Review"** then **"Save policy"**

### Policy 2: Public read access (SELECT)

Since the bucket is PUBLIC, this is optional, but you can add it for explicit control:

1. Click **"New policy"**
2. Select **"Create a policy from scratch"**
3. Configure:
   - **Policy name:** `Public read access`
   - **Allowed operation:** `SELECT`
   - **Policy definition:** Copy/paste this:
     ```sql
     bucket_id = 'photos'
     ```
   - **Description:** Allows anyone to read photos (public bucket)

4. Click **"Review"** then **"Save policy"**

### Policy 3: Users can update their own photos (UPDATE)

1. Click **"New policy"**
2. Select **"Create a policy from scratch"**
3. Configure:
   - **Policy name:** `Users can update their own photos`
   - **Allowed operation:** `UPDATE`
   - **Policy definition:** Copy/paste this:
     ```sql
     bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
     ```
     Alternative: `bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'`
   - **Description:** Allows users to update files in their own folder

4. Click **"Review"** then **"Save policy"**

### Policy 4: Users can delete their own photos (DELETE)

1. Click **"New policy"**
2. Select **"Create a policy from scratch"**
3. Configure:
   - **Policy name:** `Users can delete their own photos`
   - **Allowed operation:** `DELETE`
   - **Policy definition:** Copy/paste this:
     ```sql
     bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
     ```
     Alternative: `bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'`
   - **Description:** Allows users to delete files in their own folder

4. Click **"Review"** then **"Save policy"**

---

## Step 3: Photos Table RLS Policies (SQL Editor)

Run this SQL in the **SQL Editor** to ensure photos table RLS policies are correctly configured:

```sql
-- Enable RLS on photos table (if not already enabled)
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid duplicates)
DROP POLICY IF EXISTS "Users can view their own photos" ON photos;
DROP POLICY IF EXISTS "Users can insert their own photos" ON photos;
DROP POLICY IF EXISTS "Users can update their own photos" ON photos;
DROP POLICY IF EXISTS "Users can delete their own photos" ON photos;

-- Policy 1: SELECT - Users can read their own rows
CREATE POLICY "Users can view their own photos"
  ON photos FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: INSERT - Users can insert if auth.uid() = user_id
CREATE POLICY "Users can insert their own photos"
  ON photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: UPDATE - Users can update their own rows
CREATE POLICY "Users can update their own photos"
  ON photos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: DELETE - Users can delete their own rows
CREATE POLICY "Users can delete their own photos"
  ON photos FOR DELETE
  USING (auth.uid() = user_id);
```

---

## Storage Path Structure

Photos are stored with this path structure:
```
{user_id}/{bucket_type}/{photo_id}.jpg
```

Examples:
- `550e8400-e29b-41d4-a716-446655440000/human/123e4567-e89b-12d3-a456-426614174000.jpg`
- `550e8400-e29b-41d4-a716-446655440000/dog/123e4567-e89b-12d3-a456-426614174001.jpg`

The RLS policies check that `(storage.foldername(name))[1]` (the userId in path `users/{userId}/...`) matches `auth.uid()::text`.

**Troubleshooting:** If you get "new row violates row-level security policy" error:
- Verify the policy uses: `(storage.foldername(name))[1] = auth.uid()::text` (note the parentheses)
- Or use the simpler: `name LIKE 'users/' || auth.uid()::text || '/%'`
- Make sure the storage path format matches: `users/{userId}/...`

---

## Verification

### Test Storage Bucket:
1. Upload a test file via your app
2. Check it appears in Storage → photos bucket
3. Verify you can access the public URL

### Test Photos Table RLS:
Run these queries in SQL Editor (replace with your user_id):

```sql
-- Should return only your photos
SELECT * FROM photos WHERE user_id = auth.uid();

-- Should fail (no rows returned for other users)
SELECT * FROM photos WHERE user_id != auth.uid();
```

---

## Future: Making Bucket Private

When ready to make the bucket private:

1. Go to Storage → photos bucket
2. Click **"Settings"** tab
3. Toggle **"Public bucket"** to **OFF**
4. Update Storage RLS policies:
   - Change SELECT policy to require authentication:
     ```sql
     bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
     ```
     Alternative (simpler, recommended): 
     ```sql
     bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'
     ```
   - This ensures users can only read their own photos

---

## Troubleshooting

### "Bucket not found" error
- Verify bucket name is exactly `photos` (case-sensitive)
- Check you're in the correct Supabase project

### "Permission denied" when uploading
- Verify RLS policies are created correctly
- Check that `auth.uid()` matches the first folder in storage path
- Ensure user is authenticated

### Can't read photos
- If bucket is PUBLIC, verify SELECT policy allows public access
- Check storage path matches expected format: `{user_id}/...`

