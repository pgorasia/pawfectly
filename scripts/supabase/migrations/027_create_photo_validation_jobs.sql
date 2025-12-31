-- Migration: Create photo_validation_jobs table and trigger
-- This table stores jobs for photo validation that are processed by the process-photo-jobs edge function
-- A trigger automatically creates a job when a photo with status='pending' is inserted

-- Create photo_validation_jobs table if it doesn't exist
CREATE TABLE IF NOT EXISTS photo_validation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  bucket_type TEXT NOT NULL CHECK (bucket_type IN ('dog', 'human')),
  target_type TEXT NOT NULL CHECK (target_type IN ('dog', 'human')),
  dog_slot INTEGER,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create unique constraint on (photo_id, storage_path) to prevent duplicate jobs
-- This allows ON CONFLICT handling in the trigger function
CREATE UNIQUE INDEX IF NOT EXISTS uq_photo_validation_jobs_photo_storage
  ON photo_validation_jobs(photo_id, storage_path);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_photo_validation_jobs_photo_id ON photo_validation_jobs(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_validation_jobs_user_id ON photo_validation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_photo_validation_jobs_status ON photo_validation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_photo_validation_jobs_next_run_at ON photo_validation_jobs(next_run_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_photo_validation_jobs_locked_at ON photo_validation_jobs(locked_at) WHERE locked_at IS NOT NULL;

-- Enable RLS
ALTER TABLE photo_validation_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for photo_validation_jobs table
-- Drop existing policies if they exist (to allow re-running migration)
DROP POLICY IF EXISTS "Users can view their own photo validation jobs" ON photo_validation_jobs;
DROP POLICY IF EXISTS "Users can insert photo validation jobs for their own photos" ON photo_validation_jobs;
DROP POLICY IF EXISTS "Users can update their own photo validation jobs" ON photo_validation_jobs;

-- Users can view their own jobs
CREATE POLICY "Users can view their own photo validation jobs"
  ON photo_validation_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert jobs (via trigger)
-- Note: Triggers run with the privileges of the user who triggered them
-- So we need to allow authenticated users to insert jobs for their own photos
CREATE POLICY "Users can insert photo validation jobs for their own photos"
  ON photo_validation_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can update jobs (for the worker)
-- For now, we'll allow users to update their own jobs (though the worker uses service role)
CREATE POLICY "Users can update their own photo validation jobs"
  ON photo_validation_jobs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to create a validation job when a photo is inserted
CREATE OR REPLACE FUNCTION create_photo_validation_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create a job if the photo status is 'pending'
  IF NEW.status = 'pending' THEN
    INSERT INTO photo_validation_jobs (
      photo_id,
      user_id,
      storage_path,
      bucket_type,
      target_type,
      dog_slot,
      status,
      next_run_at
    ) VALUES (
      NEW.id,
      NEW.user_id,
      NEW.storage_path,
      NEW.bucket_type,
      NEW.target_type,
      NEW.dog_slot,
      'queued',
      NOW()
    )
    ON CONFLICT (photo_id, storage_path) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS trigger_create_photo_validation_job ON photos;
CREATE TRIGGER trigger_create_photo_validation_job
  AFTER INSERT ON photos
  FOR EACH ROW
  EXECUTE FUNCTION create_photo_validation_job();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_photo_validation_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_photo_validation_jobs_updated_at ON photo_validation_jobs;
CREATE TRIGGER update_photo_validation_jobs_updated_at
  BEFORE UPDATE ON photo_validation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_photo_validation_jobs_updated_at();
