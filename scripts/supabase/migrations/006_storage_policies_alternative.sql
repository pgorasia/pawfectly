-- Alternative Migration: Storage RLS Policies using LIKE pattern (simpler syntax)
-- Run this in Supabase SQL Editor if the previous migration doesn't work
-- This uses a simpler LIKE pattern instead of storage.foldername()

-- First, ensure RLS is enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for photos bucket if they exist
DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;

-- Policy 1: Allow authenticated users to upload (INSERT) to their own folder
-- Path format: users/{userId}/{bucketType}/{dogId-or-human}/{timestamp}_{random}.jpg
-- Checks that path starts with users/{auth.uid()}/
CREATE POLICY "Users can upload their own photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photos' 
  AND name LIKE 'users/' || auth.uid()::text || '/%'
);

-- Policy 2: Public read access (SELECT) - for PUBLIC bucket
CREATE POLICY "Public read access"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'photos');

-- Policy 3: Allow authenticated users to update (UPDATE) their own files
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

-- Policy 4: Allow authenticated users to delete (DELETE) their own files
CREATE POLICY "Users can delete their own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' 
  AND name LIKE 'users/' || auth.uid()::text || '/%'
);

