-- Migration: Remove redundant status column from profiles table
-- The status column has been replaced by lifecycle_status and validation_status (migration 022)
-- This migration removes old triggers and drops the status column

-- Drop old triggers that update profiles.status
DROP TRIGGER IF EXISTS trigger_set_profile_active_on_photo_approval ON photos;
DROP TRIGGER IF EXISTS trigger_check_profile_status_on_photo_delete ON photos;

-- Drop old trigger functions (they update the status column which we're removing)
DROP FUNCTION IF EXISTS check_and_set_profile_status_active();
DROP FUNCTION IF EXISTS check_profile_status_on_photo_delete();

-- Drop the status column constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

-- Drop the status column (data was already migrated to lifecycle_status and validation_status in migration 022)
ALTER TABLE profiles DROP COLUMN IF EXISTS status;

-- Note: The new validation system uses:
-- - lifecycle_status: 'onboarding', 'pending_review', 'active', 'limited', 'blocked'
-- - validation_status: 'not_started', 'in_progress', 'passed', 'failed_requirements', 'failed_photos'
-- These are managed by the statusRepository and validate-profile edge function

