-- Fix dog_id constraint to allow null for dog bucket (for onboarding)
-- Run this in Supabase SQL Editor

-- Drop the strict constraint that requires dog_id for dog bucket
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_dog_id_check;

-- Add a relaxed constraint that only enforces human bucket has null dog_id
-- Dog bucket can have null dog_id (for onboarding temporary IDs)
ALTER TABLE photos ADD CONSTRAINT photos_dog_id_check CHECK (
  (bucket_type = 'human' AND dog_id IS NULL)
  -- For dog bucket, dog_id can be null or a valid UUID
  -- This allows photos to be uploaded before dogs are saved to the database
);

