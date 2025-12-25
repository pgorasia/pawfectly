-- Migration: Create photos and trust_badges tables
-- Run this in your Supabase SQL editor

-- Create photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dog_id UUID,
  bucket_type TEXT NOT NULL CHECK (bucket_type IN ('dog', 'human')),
  storage_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_labels JSONB,
  server_labels JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  classification TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (classification IN ('DOG_ONLY', 'HUMAN_ONLY', 'HUMAN_AND_DOG', 'NEITHER', 'UNKNOWN')),
  contains_dog BOOLEAN NOT NULL DEFAULT false,
  contains_human BOOLEAN NOT NULL DEFAULT false,
  contains_both BOOLEAN NOT NULL DEFAULT false,
  -- Note: During onboarding, dog_id may be null even for dog bucket photos
  -- This allows photos to be uploaded before dogs are saved to the database
  -- The constraint is relaxed to allow null dog_id for dog bucket during onboarding
  CONSTRAINT photos_dog_id_check CHECK (
    (bucket_type = 'human' AND dog_id IS NULL)
  )
);

-- Create indexes for photos table
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_dog_id ON photos(dog_id) WHERE dog_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photos_bucket_type ON photos(bucket_type);
CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_contains_dog ON photos(contains_dog) WHERE contains_dog = true;
CREATE INDEX IF NOT EXISTS idx_photos_contains_human ON photos(contains_human) WHERE contains_human = true;
CREATE INDEX IF NOT EXISTS idx_photos_contains_both ON photos(contains_both) WHERE contains_both = true;

-- Create trust_badges table
CREATE TABLE IF NOT EXISTS trust_badges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_type)
);

-- Create indexes for trust_badges table
CREATE INDEX IF NOT EXISTS idx_trust_badges_user_id ON trust_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_trust_badges_badge_type ON trust_badges(badge_type);
CREATE INDEX IF NOT EXISTS idx_trust_badges_earned_at ON trust_badges(earned_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_badges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for photos table
-- Users can only see their own photos
CREATE POLICY "Users can view their own photos"
  ON photos FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own photos
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

-- RLS Policies for trust_badges table
-- Users can only see their own badges
CREATE POLICY "Users can view their own trust badges"
  ON trust_badges FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own badges (via service role or function)
CREATE POLICY "Users can insert their own trust badges"
  ON trust_badges FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own badges
CREATE POLICY "Users can update their own trust badges"
  ON trust_badges FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add profile verification column (if profiles table exists)
-- This gate blocks feed access if photos are not verified
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'profiles') THEN
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified_photos BOOLEAN DEFAULT false;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photos_valid BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Note: Storage bucket 'photos' needs to be created separately in Supabase Storage
-- with appropriate RLS policies for public read access to photos

