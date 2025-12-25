-- Migration: Fix photos_status_check constraint to allow 'approved'
-- Run this in Supabase SQL Editor
-- This fixes: "new row for relation "photos" violates check constraint "photos_status_check""

-- Step 1: Update any existing 'validated' statuses to 'approved'
UPDATE photos SET status = 'approved' WHERE status = 'validated';

-- Step 2: Drop the existing constraint
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_status_check;

-- Step 3: Create new constraint with correct values
ALTER TABLE photos ADD CONSTRAINT photos_status_check CHECK (
  status IN ('pending', 'approved', 'rejected')
);

-- Step 4: Verify the constraint
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'photos'::regclass 
  AND conname = 'photos_status_check';

-- Expected result:
-- constraint_definition should be: CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))

