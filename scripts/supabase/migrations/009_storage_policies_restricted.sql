-- Storage RLS Policies with folder restrictions (use AFTER 008 works)
-- Run this ONLY after verifying that migration 008 works
-- This restricts uploads to user's own folder: users/{userId}/...

-- Drop the simple policies first
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete photos" ON storage.objects;

-- Policy 1: Users can only upload to their own folder
-- Path format: users/{userId}/{bucketType}/{dogId-or-human}/{timestamp}_{random}.jpg
CREATE POLICY "Users can upload their own photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' 
  AND name LIKE 'users/' || auth.uid()::text || '/%'
);

-- Policy 2: Public read access (keep this from 008)
-- (Already exists, no need to recreate)

-- Policy 3: Users can only update their own files
CREATE POLICY "Users can update their own photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'photos' 
  AND name LIKE 'users/' || auth.uid()::text || '/%'
)
WITH CHECK (
  bucket_id = 'photos' 
  AND name LIKE 'users/' || auth.uid()::text || '/%'
);

-- Policy 4: Users can only delete their own files
CREATE POLICY "Users can delete their own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' 
  AND name LIKE 'users/' || auth.uid()::text || '/%'
);

