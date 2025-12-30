-- Migration: Fix onboarding_status last_step CHECK constraint
-- This ensures the constraint includes all valid steps: pack, human, photos, preferences, done
-- Run this if you already ran migration 021 and the constraint is missing 'human'

-- Drop existing constraint if it exists
ALTER TABLE onboarding_status DROP CONSTRAINT IF EXISTS onboarding_status_last_step_check;

-- Add new constraint with all valid steps
ALTER TABLE onboarding_status ADD CONSTRAINT onboarding_status_last_step_check 
  CHECK (last_step IN ('pack','human','photos','preferences','done'));

-- Verify: Check if any existing rows have invalid last_step values
-- If any exist, update them to a valid value
UPDATE onboarding_status
SET last_step = 'pack'
WHERE last_step NOT IN ('pack','human','photos','preferences','done');

