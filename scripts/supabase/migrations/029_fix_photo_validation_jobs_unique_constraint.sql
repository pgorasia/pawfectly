-- Migration: Fix photo_validation_jobs unique constraint
-- Ensures the unique constraint exists for ON CONFLICT handling in enqueue_photo_validation_job()
-- This fixes the error: "there is no unique or exclusion constraint matching the ON CONFLICT specification"

-- Create unique constraint on (photo_id, storage_path) if it doesn't exist
-- This allows ON CONFLICT handling in the enqueue_photo_validation_job() function
CREATE UNIQUE INDEX IF NOT EXISTS uq_photo_validation_jobs_photo_storage
  ON photo_validation_jobs(photo_id, storage_path);

-- Verify the constraint exists (for debugging)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'uq_photo_validation_jobs_photo_storage'
  ) THEN
    RAISE EXCEPTION 'Failed to create unique constraint uq_photo_validation_jobs_photo_storage';
  END IF;
END $$;
