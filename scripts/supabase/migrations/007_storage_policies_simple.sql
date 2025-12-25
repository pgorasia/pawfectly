-- Simple Storage RLS Policies for photos bucket
-- Run this in Supabase SQL Editor
-- This is the SIMPLEST version that allows any authenticated user to upload

-- Ensure RLS is enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies for photos bucket to start fresh
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname LIKE '%photos%') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON storage.objects';
    END LOOP;
END $$;

-- Policy 1: Allow ANY authenticated user to upload to photos bucket (for testing)
-- This is less secure but will help verify the basic setup works
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'photos');

-- Policy 2: Public read access
CREATE POLICY "Public can read photos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'photos');

-- Policy 3: Authenticated users can update their own photos
-- Check path starts with users/{their_user_id}/
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

-- Policy 4: Authenticated users can delete their own photos
CREATE POLICY "Users can delete their own photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'photos' 
  AND name LIKE 'users/' || auth.uid()::text || '/%'
);

