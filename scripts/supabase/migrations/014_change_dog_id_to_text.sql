-- Migration: Change dog_id column from UUID to TEXT
-- Run this in Supabase SQL Editor
-- This allows us to use simple string IDs: 'NA' for human, 'dog1', 'dog2', etc. for dogs

-- Step 1: Drop the foreign key constraint if it exists (dog_id might reference dogs table)
DO $$
BEGIN
  -- Check if there's a foreign key constraint on dog_id
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%dog_id%' 
      AND table_name = 'photos'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    -- Drop foreign key constraint
    ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_dog_id_fkey;
  END IF;
END $$;

-- Step 2: Change the column type from UUID to TEXT
-- First, convert existing UUID values to text (if any exist)
ALTER TABLE photos ALTER COLUMN dog_id TYPE TEXT USING dog_id::TEXT;

-- Step 3: Update the constraint to work with TEXT
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_dog_id_check;
ALTER TABLE photos ADD CONSTRAINT photos_dog_id_check CHECK (
  (bucket_type = 'human' AND dog_id = 'NA') OR
  (bucket_type = 'dog' AND (
    dog_id ~ '^dog[0-9]+$' OR  -- Simple IDs: dog1, dog2, dog3, etc.
    dog_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'  -- UUID format (for when dogs are saved to DB later)
  ))
);

-- Step 4: Verify the change
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'photos' 
  AND column_name = 'dog_id';

-- Expected result: data_type should be 'text'

