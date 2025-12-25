-- Fix RLS Policies for photos table
-- Run this in your Supabase SQL Editor if you're getting RLS policy violations

-- First, check if RLS is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'photos'
  ) THEN
    RAISE EXCEPTION 'photos table does not exist. Please run the migration first.';
  END IF;
END $$;

-- Enable RLS if not already enabled
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_badges ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own photos" ON photos;
DROP POLICY IF EXISTS "Users can insert their own photos" ON photos;
DROP POLICY IF EXISTS "Users can update their own photos" ON photos;
DROP POLICY IF EXISTS "Users can delete their own photos" ON photos;

-- Recreate policies with proper permissions
-- Users can only see their own photos
CREATE POLICY "Users can view their own photos"
  ON photos FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own photos
-- IMPORTANT: WITH CHECK ensures the user_id matches auth.uid()
CREATE POLICY "Users can insert their own photos"
  ON photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own photos
CREATE POLICY "Users can update their own photos"
  ON photos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own photos
CREATE POLICY "Users can delete their own photos"
  ON photos FOR DELETE
  USING (auth.uid() = user_id);

-- Trust badges policies
DROP POLICY IF EXISTS "Users can view their own trust badges" ON trust_badges;
DROP POLICY IF EXISTS "Users can insert their own trust badges" ON trust_badges;
DROP POLICY IF EXISTS "Users can update their own trust badges" ON trust_badges;

CREATE POLICY "Users can view their own trust badges"
  ON trust_badges FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trust badges"
  ON trust_badges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trust badges"
  ON trust_badges FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Verify policies are created
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
WHERE tablename IN ('photos', 'trust_badges')
ORDER BY tablename, policyname;

