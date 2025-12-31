-- Migration: Add RLS policies for photo_validation_jobs table
-- The table was created without RLS policies (relying on service role bypass)
-- But triggers run with the privileges of the user who triggered them
-- So we need policies to allow authenticated users to insert jobs for their own photos

-- Drop existing policies if they exist (to allow re-running migration)
DROP POLICY IF EXISTS "Users can view their own photo validation jobs" ON photo_validation_jobs;
DROP POLICY IF EXISTS "Users can insert photo validation jobs for their own photos" ON photo_validation_jobs;
DROP POLICY IF EXISTS "Users can update their own photo validation jobs" ON photo_validation_jobs;

-- Users can view their own jobs
CREATE POLICY "Users can view their own photo validation jobs"
  ON photo_validation_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert jobs for their own photos (needed for trigger)
-- The trigger enqueue_photo_validation_job() runs with the privileges of the user
-- who inserted the photo, so we need this policy to allow the insert
CREATE POLICY "Users can insert photo validation jobs for their own photos"
  ON photo_validation_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs (though the worker uses service role)
-- This is useful for debugging and allows users to see job status
CREATE POLICY "Users can update their own photo validation jobs"
  ON photo_validation_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
