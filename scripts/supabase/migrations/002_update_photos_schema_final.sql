-- Migration: Update photos and trust_badges schema
-- Run this in your Supabase SQL editor
-- Safe to run multiple times (uses IF NOT EXISTS)

-- ============================================================================
-- PHOTOS TABLE: Add missing columns
-- ============================================================================

-- Add mime_type column (handle existing rows properly)
ALTER TABLE photos ADD COLUMN IF NOT EXISTS mime_type TEXT;
UPDATE photos SET mime_type = 'image/jpeg' WHERE mime_type IS NULL;
ALTER TABLE photos ALTER COLUMN mime_type SET DEFAULT 'image/jpeg';
ALTER TABLE photos ALTER COLUMN mime_type SET NOT NULL;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS ai_labels JSONB;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS ai_text TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================================
-- PHOTOS TABLE: Update status constraint
-- IMPORTANT: This changes 'validated' → 'approved'
-- You'll need to update TypeScript types and code to use 'approved' instead
-- ============================================================================

UPDATE photos SET status = 'approved' WHERE status = 'validated';
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_status_check;
ALTER TABLE photos ADD CONSTRAINT photos_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

-- ============================================================================
-- PHOTOS TABLE: Update dog_id constraint
-- NOTE: Allow null dog_id for dog bucket during onboarding (before dogs are saved to DB)
-- The constraint is relaxed to handle temporary dog IDs during onboarding
-- ============================================================================

ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_dog_id_check;
ALTER TABLE photos ADD CONSTRAINT photos_dog_id_check CHECK (
  (bucket_type = 'human' AND dog_id IS NULL)
  -- For dog bucket, dog_id can be null (during onboarding) or a valid UUID
  -- We don't enforce NOT NULL here to allow onboarding flow
);

-- ============================================================================
-- PHOTOS TABLE: Create composite indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_photos_user_id_status ON photos(user_id, status);
CREATE INDEX IF NOT EXISTS idx_photos_user_id_bucket_type ON photos(user_id, bucket_type);

-- ============================================================================
-- TRUST_BADGES TABLE: Add id column (convert from composite key to single PK)
-- ============================================================================

ALTER TABLE trust_badges ADD COLUMN IF NOT EXISTS id UUID;
UPDATE trust_badges SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE trust_badges ALTER COLUMN id SET NOT NULL, ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE trust_badges DROP CONSTRAINT IF EXISTS trust_badges_pkey;
ALTER TABLE trust_badges ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_badges_user_badge_unique ON trust_badges(user_id, badge_type);

-- ============================================================================
-- TRUST_BADGES TABLE: Rename earned_at to awarded_at (if needed)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trust_badges' AND column_name = 'earned_at') THEN
    ALTER TABLE trust_badges RENAME COLUMN earned_at TO awarded_at;
  END IF;
END $$;

ALTER TABLE trust_badges ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp on photos
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_photos_updated_at ON photos;
CREATE TRIGGER update_photos_updated_at
BEFORE UPDATE ON photos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

