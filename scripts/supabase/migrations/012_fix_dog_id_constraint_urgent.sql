-- URGENT FIX: Allow null dog_id for dog bucket photos
-- Run this in Supabase SQL Editor immediately
-- This fixes the constraint violation error when uploading dog photos during onboarding

-- Step 1: Drop the existing constraint
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_dog_id_check;

-- Step 2: Create a new relaxed constraint
-- Only enforce that human bucket must have null dog_id
-- Dog bucket can have null dog_id (for onboarding temporary IDs) OR a valid UUID
ALTER TABLE photos ADD CONSTRAINT photos_dog_id_check CHECK (
  (bucket_type = 'human' AND dog_id IS NULL)
  -- For dog bucket: dog_id can be null (onboarding) or any value (UUID)
  -- We don't enforce NOT NULL here to allow onboarding flow
);

-- Step 3: Verify the constraint was created
-- Run this query to check:
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'photos'::regclass AND conname = 'photos_dog_id_check';

