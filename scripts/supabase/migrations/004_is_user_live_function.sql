-- Migration: Create is_user_live function for profile gating
-- Run this in your Supabase SQL Editor

-- Function to check if a user is "live" (can appear in feeds)
-- Returns true only if:
-- 1. At least 1 approved human photo exists (bucket_type='human' AND status='approved')
-- 2. For each dog the user has, at least 1 approved dog photo exists
CREATE OR REPLACE FUNCTION is_user_live(check_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_approved_human_photo BOOLEAN;
  dog_count INTEGER;
  dog_with_approved_photo_count INTEGER;
BEGIN
  -- Check if user has at least 1 approved human photo
  SELECT EXISTS (
    SELECT 1 
    FROM photos 
    WHERE user_id = check_user_id 
      AND bucket_type = 'human' 
      AND status = 'approved'
  ) INTO has_approved_human_photo;

  -- If no approved human photo, user is not live
  IF NOT has_approved_human_photo THEN
    RETURN FALSE;
  END IF;

  -- Check if user has dogs (using photos table dog_id)
  -- This works even if dogs table doesn't exist yet
  SELECT COUNT(DISTINCT dog_id) INTO dog_count
  FROM photos
  WHERE user_id = check_user_id
    AND bucket_type = 'dog'
    AND dog_id IS NOT NULL;

  -- If user has no dog photos, only human photo check matters (already passed above)
  IF dog_count = 0 THEN
    RETURN TRUE;
  END IF;

  -- Check if all unique dog_ids have at least 1 approved photo
  SELECT COUNT(DISTINCT dog_id) INTO dog_with_approved_photo_count
  FROM photos
  WHERE user_id = check_user_id
    AND bucket_type = 'dog'
    AND dog_id IS NOT NULL
    AND status = 'approved';

  -- User is live only if all dogs have approved photos
  RETURN dog_count = dog_with_approved_photo_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_user_live(UUID) TO authenticated;

-- Create index to optimize photo status queries
CREATE INDEX IF NOT EXISTS idx_photos_user_bucket_status 
ON photos(user_id, bucket_type, status) 
WHERE status = 'approved';
