-- Migration: Add lifecycle_status, validation_status, and validation_run_id to profiles table
-- This separates onboarding flow from validation/moderation lifecycle

-- Add new columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'onboarding' 
  CHECK (lifecycle_status IN ('onboarding','pending_review','active','limited','blocked')),
ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'not_started' 
  CHECK (validation_status IN ('not_started','in_progress','passed','failed_requirements','failed_photos')),
ADD COLUMN IF NOT EXISTS validation_run_id uuid NULL,
ADD COLUMN IF NOT EXISTS validation_started_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Migrate existing status values to lifecycle_status
-- Map old status values to new lifecycle_status
UPDATE profiles
SET 
  lifecycle_status = CASE 
    WHEN status = 'draft' THEN 'onboarding'
    WHEN status = 'active' THEN 'active'
    WHEN status = 'failed_verification' THEN 'pending_review'
    ELSE 'onboarding'
  END,
  validation_status = CASE
    WHEN status = 'failed_verification' THEN 'failed_photos'
    WHEN status = 'active' THEN 'passed'
    ELSE 'not_started'
  END
WHERE lifecycle_status = 'onboarding' OR lifecycle_status IS NULL;

-- Create index on lifecycle_status for feed queries
CREATE INDEX IF NOT EXISTS idx_profiles_lifecycle_status ON profiles(lifecycle_status) 
  WHERE lifecycle_status IN ('active','limited');

-- Create index on validation_run_id for edge function updates
CREATE INDEX IF NOT EXISTS idx_profiles_validation_run_id ON profiles(validation_run_id) 
  WHERE validation_run_id IS NOT NULL;

-- Note: RLS policies on profiles table should already allow users to update their own row
-- Ensure updated_at is updated on row changes
CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profiles_updated_at ON profiles;
CREATE TRIGGER trigger_update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_profiles_updated_at();

