-- Storage RLS Policies for photos bucket
-- Run this in Supabase SQL Editor
-- NOTE: Do NOT try to ALTER storage.objects - it's a system table and RLS is already enabled by default

-- Drop existing policies for photos bucket (if they exist)
-- This will clean up any incorrectly named or conflicting policies
DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Public can read photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;

-- Policy 1: Allow ANY authenticated user to upload to photos bucket
-- Start simple to test if policies work at all
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'photos');

-- Policy 2: Public read access (since bucket is PUBLIC)
CREATE POLICY "Public can read photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'photos');

-- Policy 3: Authenticated users can update files in photos bucket
CREATE POLICY "Authenticated users can update photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'photos')
WITH CHECK (bucket_id = 'photos');

-- Policy 4: Authenticated users can delete files in photos bucket
CREATE POLICY "Authenticated users can delete photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'photos');

