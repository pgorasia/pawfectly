-- Migration: Update trust_badges table to add status and revoked_at
-- Adds status enum for earned/revoked badges and revocation tracking

-- Ensure unique constraint exists on (user_id, badge_type)
-- This should already exist as PRIMARY KEY, but let's make sure
DO $$
BEGIN
  -- Check if primary key constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'trust_badges_pkey' 
    AND conrelid = 'trust_badges'::regclass
  ) THEN
    -- Add primary key if it doesn't exist
    ALTER TABLE trust_badges 
    ADD CONSTRAINT trust_badges_pkey PRIMARY KEY (user_id, badge_type);
  END IF;
END $$;

-- Add status column (enum: earned | revoked)
DO $$
BEGIN
  -- Create enum type if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'badge_status') THEN
    CREATE TYPE badge_status AS ENUM ('earned', 'revoked');
  END IF;
END $$;

-- Add status and revoked_at columns
ALTER TABLE trust_badges
ADD COLUMN IF NOT EXISTS status badge_status NOT NULL DEFAULT 'earned',
ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL;

-- Create index on status for querying active badges
CREATE INDEX IF NOT EXISTS idx_trust_badges_status ON trust_badges(status) 
  WHERE status = 'earned';

-- Create index on revoked_at
CREATE INDEX IF NOT EXISTS idx_trust_badges_revoked_at ON trust_badges(revoked_at) 
  WHERE revoked_at IS NOT NULL;

-- Update existing badges to have status = 'earned'
UPDATE trust_badges
SET status = 'earned'
WHERE status IS NULL;

-- Function to check and award photo_with_dog badge
-- This is called when a photo is approved with contains_dog=true AND contains_human=true
CREATE OR REPLACE FUNCTION check_and_award_photo_with_dog_badge(p_user_id UUID)
RETURNS void AS $$
DECLARE
  has_photo_with_dog BOOLEAN;
BEGIN
  -- Check if user has at least one approved photo with both dog and human
  SELECT EXISTS (
    SELECT 1
    FROM photos
    WHERE user_id = p_user_id
      AND status = 'approved'
      AND contains_dog = true
      AND contains_human = true
  ) INTO has_photo_with_dog;

  -- If user has photo with dog, award/re-earn badge
  IF has_photo_with_dog THEN
    INSERT INTO trust_badges (user_id, badge_type, earned_at, status, revoked_at, metadata)
    VALUES (p_user_id, 'photo_with_dog', NOW(), 'earned', NULL, NULL)
    ON CONFLICT (user_id, badge_type) 
    DO UPDATE SET
      status = 'earned',
      revoked_at = NULL,
      earned_at = COALESCE(trust_badges.earned_at, NOW()),
      metadata = COALESCE(trust_badges.metadata, NULL);
  ELSE
    -- If user no longer has photo with dog, revoke badge if it exists and is earned
    UPDATE trust_badges
    SET status = 'revoked',
        revoked_at = NOW()
    WHERE user_id = p_user_id
      AND badge_type = 'photo_with_dog'
      AND status = 'earned';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_and_award_photo_with_dog_badge(UUID) TO authenticated;

-- Trigger function to check and award photo_with_dog badge when photo status changes to approved
CREATE OR REPLACE FUNCTION trigger_check_photo_with_dog_badge()
RETURNS TRIGGER AS $$
BEGIN
  -- For INSERT: check if photo is approved with dog and human
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'approved' AND NEW.contains_dog = true AND NEW.contains_human = true THEN
      PERFORM check_and_award_photo_with_dog_badge(NEW.user_id);
    END IF;
    RETURN NEW;
  END IF;
  
  -- For UPDATE: check both new and old states
  IF TG_OP = 'UPDATE' THEN
    -- If photo is now approved and has both dog and human
    IF NEW.status = 'approved' AND NEW.contains_dog = true AND NEW.contains_human = true THEN
      PERFORM check_and_award_photo_with_dog_badge(NEW.user_id);
    -- If photo was approved with dog and human but is no longer
    ELSIF OLD.status = 'approved' AND OLD.contains_dog = true AND OLD.contains_human = true 
          AND (NEW.status != 'approved' OR NEW.contains_dog = false OR NEW.contains_human = false) THEN
      PERFORM check_and_award_photo_with_dog_badge(NEW.user_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on photos table
DROP TRIGGER IF EXISTS trigger_check_photo_with_dog_badge ON photos;
CREATE TRIGGER trigger_check_photo_with_dog_badge
  AFTER INSERT OR UPDATE OF status, contains_dog, contains_human ON photos
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_photo_with_dog_badge();

-- Also revoke badge when photo is deleted
CREATE OR REPLACE FUNCTION trigger_revoke_photo_with_dog_badge_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- If deleted photo was approved with dog and human, check if badge should be revoked
  IF OLD.status = 'approved' AND OLD.contains_dog = true AND OLD.contains_human = true THEN
    PERFORM check_and_award_photo_with_dog_badge(OLD.user_id);
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on photo deletion
DROP TRIGGER IF EXISTS trigger_revoke_photo_with_dog_badge_on_delete ON photos;
CREATE TRIGGER trigger_revoke_photo_with_dog_badge_on_delete
  AFTER DELETE ON photos
  FOR EACH ROW
  WHEN (OLD.status = 'approved' AND OLD.contains_dog = true AND OLD.contains_human = true)
  EXECUTE FUNCTION trigger_revoke_photo_with_dog_badge_on_delete();
