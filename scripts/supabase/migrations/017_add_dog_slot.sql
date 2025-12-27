-- Migration: Add dog_slot to photos table for stable photo mapping
-- Run this in Supabase SQL Editor
--
-- Changes:
-- 1. Add dog_slot INT NULL column to photos table
-- 2. Add index on (user_id, dog_slot)
-- 3. Add CHECK constraint for dog_slot between 1 and 3 (optional)
-- 4. Ensure dogs table has slot column (if it exists)

-- Step 1: Add dog_slot column to photos table
ALTER TABLE photos ADD COLUMN IF NOT EXISTS dog_slot INT NULL;

-- Step 2: Add index on (user_id, dog_slot) for efficient queries
CREATE INDEX IF NOT EXISTS idx_photos_user_id_dog_slot ON photos(user_id, dog_slot) WHERE dog_slot IS NOT NULL;

-- Step 3: Add CHECK constraint to ensure dog_slot is between 1 and 3 (if not null)
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_dog_slot_check;
ALTER TABLE photos ADD CONSTRAINT photos_dog_slot_check CHECK (dog_slot IS NULL OR (dog_slot >= 1 AND dog_slot <= 3));

-- Step 4: If dogs table exists, add slot column and constraints
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'dogs') THEN
    -- Add slot column to dogs table
    ALTER TABLE dogs ADD COLUMN IF NOT EXISTS slot INT;
    
    -- Add unique index on (user_id, slot) to ensure one dog per slot per user
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dogs_user_id_slot ON dogs(user_id, slot) WHERE slot IS NOT NULL;
    
    -- Add CHECK constraint to ensure slot is between 1 and 3
    ALTER TABLE dogs DROP CONSTRAINT IF EXISTS dogs_slot_check;
    ALTER TABLE dogs ADD CONSTRAINT dogs_slot_check CHECK (slot IS NULL OR (slot >= 1 AND slot <= 3));
  END IF;
END $$;

-- Step 5: Verify changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'photos' AND column_name = 'dog_slot'
ORDER BY ordinal_position;

