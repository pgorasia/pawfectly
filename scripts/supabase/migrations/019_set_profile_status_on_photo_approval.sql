-- Migration: Set profile status to active when all photos are approved
-- This trigger function will check if all photos for a user are approved,
-- and if so, set the profile status to 'active'

CREATE OR REPLACE FUNCTION check_and_set_profile_status_active()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_total_photos INTEGER;
  v_approved_photos INTEGER;
  v_profile_exists BOOLEAN;
BEGIN
  -- Get the user_id from the updated photo
  v_user_id := NEW.user_id;

  -- Only proceed if photo status changed to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    -- Check if profile exists for this user
    SELECT EXISTS(SELECT 1 FROM profiles WHERE user_id = v_user_id) INTO v_profile_exists;
    
    IF v_profile_exists THEN
      -- Count total photos for this user (excluding deleted/rejected ones that were removed)
      SELECT COUNT(*) INTO v_total_photos
      FROM photos
      WHERE user_id = v_user_id
        AND status IN ('pending', 'approved', 'rejected');

      -- Count approved photos for this user
      SELECT COUNT(*) INTO v_approved_photos
      FROM photos
      WHERE user_id = v_user_id
        AND status = 'approved';

      -- If all photos are approved and there's at least one photo, set status to active
      -- Only update if current status is 'draft' (to avoid overriding 'active' or 'failed_verification')
      IF v_total_photos > 0 AND v_approved_photos = v_total_photos THEN
        UPDATE profiles
        SET status = 'active'
        WHERE user_id = v_user_id
          AND status = 'draft';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on photos table
DROP TRIGGER IF EXISTS trigger_set_profile_active_on_photo_approval ON photos;
CREATE TRIGGER trigger_set_profile_active_on_photo_approval
  AFTER UPDATE OF status ON photos
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION check_and_set_profile_status_active();

-- Also handle the case when a photo is deleted (need to re-check status)
-- This is a separate trigger for DELETE events
CREATE OR REPLACE FUNCTION check_profile_status_on_photo_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_total_photos INTEGER;
  v_approved_photos INTEGER;
BEGIN
  -- Count remaining photos for this user
  SELECT COUNT(*) INTO v_total_photos
  FROM photos
  WHERE user_id = OLD.user_id
    AND status IN ('pending', 'approved', 'rejected');

  -- Count approved photos
  SELECT COUNT(*) INTO v_approved_photos
  FROM photos
  WHERE user_id = OLD.user_id
    AND status = 'approved';

  -- If all remaining photos are approved and there's at least one photo, set status to active
  -- If no photos remain, leave status as is (could be draft or active)
  IF v_total_photos > 0 AND v_approved_photos = v_total_photos THEN
    UPDATE profiles
    SET status = 'active'
    WHERE user_id = OLD.user_id
      AND status = 'draft';
  ELSIF v_total_photos = 0 THEN
    -- If no photos remain, set back to draft (user needs to upload photos)
    UPDATE profiles
    SET status = 'draft'
    WHERE user_id = OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_profile_status_on_photo_delete ON photos;
CREATE TRIGGER trigger_check_profile_status_on_photo_delete
  AFTER DELETE ON photos
  FOR EACH ROW
  EXECUTE FUNCTION check_profile_status_on_photo_delete();

