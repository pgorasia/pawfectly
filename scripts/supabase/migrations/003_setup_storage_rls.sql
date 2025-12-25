-- Migration: Set up Storage Bucket RLS Policies
-- NOTE: Storage bucket policies are configured via Dashboard, not SQL
-- This file documents the required policies and can be used as reference
-- 
-- See docs/STORAGE_BUCKET_SETUP.md for step-by-step Dashboard instructions

-- ============================================================================
-- PHOTOS TABLE RLS POLICIES
-- Run this SQL in Supabase SQL Editor to ensure photos table RLS is correct
-- ============================================================================

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

-- ============================================================================
-- STORAGE BUCKET POLICIES (Reference Only - Configure via Dashboard)
-- ============================================================================

-- Storage bucket policies cannot be created via SQL.
-- Use the Supabase Dashboard: Storage → photos → Policies
--
-- Required policies:
--
-- 1. INSERT: "Users can upload their own photos"
--    bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
--    Alternative: bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'
--
-- 2. SELECT: "Public read access" (for PUBLIC bucket)
--    bucket_id = 'photos'
--
-- 3. UPDATE: "Users can update their own photos"
--    bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
--    Alternative: bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'
--
-- 4. DELETE: "Users can delete their own photos"
--    bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
--    Alternative: bucket_id = 'photos' AND name LIKE 'users/' || auth.uid()::text || '/%'
--
-- See docs/STORAGE_BUCKET_SETUP.md for detailed Dashboard setup instructions

