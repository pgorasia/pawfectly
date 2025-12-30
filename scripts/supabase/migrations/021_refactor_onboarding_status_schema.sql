-- Migration: Refactor onboarding_status table schema
-- Rename *_completed columns to *_submitted and ensure correct structure

-- First, check if table exists and create if not
CREATE TABLE IF NOT EXISTS onboarding_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_step text NOT NULL DEFAULT 'pack' CHECK (last_step IN ('pack','human','photos','preferences','done')),
  dog_submitted boolean NOT NULL DEFAULT false,
  human_submitted boolean NOT NULL DEFAULT false,
  photos_submitted boolean NOT NULL DEFAULT false,
  preferences_submitted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- If onboarding_state table exists, migrate data
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'onboarding_state') THEN
    -- Migrate data from old table to new table
    INSERT INTO onboarding_status (user_id, last_step, dog_submitted, human_submitted, photos_submitted, preferences_submitted, updated_at)
    SELECT 
      user_id,
      CASE 
        WHEN last_step = 'human' THEN 'human'
        WHEN last_step = 'done' THEN 'done'
        WHEN last_step = 'preferences' THEN 'preferences'
        WHEN last_step = 'photos' THEN 'photos'
        ELSE 'pack'
      END,
      COALESCE(dog_completed, false) AS dog_submitted,
      COALESCE(human_completed, false) AS human_submitted,
      COALESCE(photos_completed, false) AS photos_submitted,
      COALESCE(preferences_completed, false) AS preferences_submitted,
      COALESCE(updated_at, now())
    FROM onboarding_state
    ON CONFLICT (user_id) DO UPDATE SET
      last_step = EXCLUDED.last_step,
      dog_submitted = EXCLUDED.dog_submitted,
      human_submitted = EXCLUDED.human_submitted,
      photos_submitted = EXCLUDED.photos_submitted,
      preferences_submitted = EXCLUDED.preferences_submitted,
      updated_at = EXCLUDED.updated_at;
  END IF;
END $$;

-- If onboarding_status already exists with pack_submitted, migrate to dog_submitted and human_submitted
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'onboarding_status' AND column_name = 'pack_submitted') THEN
    -- Add new columns if they don't exist
    ALTER TABLE onboarding_status
    ADD COLUMN IF NOT EXISTS dog_submitted boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS human_submitted boolean NOT NULL DEFAULT false;
    
    -- Migrate pack_submitted to dog_submitted (assume human_submitted stays false for existing users)
    UPDATE onboarding_status
    SET dog_submitted = pack_submitted
    WHERE dog_submitted = false;
    
    -- Drop old column
    ALTER TABLE onboarding_status DROP COLUMN IF EXISTS pack_submitted;
  END IF;
END $$;

-- Drop old table if it exists (after migration)
DROP TABLE IF EXISTS onboarding_state;

-- Update CHECK constraint to ensure it includes all valid steps
-- Drop existing constraint if it exists
ALTER TABLE onboarding_status DROP CONSTRAINT IF EXISTS onboarding_status_last_step_check;

-- Add new constraint with all valid steps
ALTER TABLE onboarding_status ADD CONSTRAINT onboarding_status_last_step_check 
  CHECK (last_step IN ('pack','human','photos','preferences','done'));

-- Create RLS policies
ALTER TABLE onboarding_status ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can select their own onboarding_status" ON onboarding_status;
DROP POLICY IF EXISTS "Users can update their own onboarding_status" ON onboarding_status;
DROP POLICY IF EXISTS "Users can insert their own onboarding_status" ON onboarding_status;

-- RLS: user can select/update/insert only their row
CREATE POLICY "Users can select their own onboarding_status"
  ON onboarding_status
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own onboarding_status"
  ON onboarding_status
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own onboarding_status"
  ON onboarding_status
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

