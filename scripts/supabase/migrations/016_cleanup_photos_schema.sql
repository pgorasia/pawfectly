-- Migration: Clean up photos table schema
-- Run this in Supabase SQL Editor
-- 
-- Changes:
-- 1. Remove unused columns: ai_text, ai_metadata, client_labels, server_labels
-- 2. Add target_type column (determines what to look for: 'dog' or 'human')
-- 3. Remove classification column (use contains_dog + contains_human instead)
-- 4. Remove contains_both column (can be computed from contains_dog && contains_human)

-- Step 1: Add target_type column (set based on bucket_type)
-- target_type determines what to look for: 'dog' for dog bucket, 'human' for human bucket
ALTER TABLE photos ADD COLUMN IF NOT EXISTS target_type TEXT;

-- Set target_type based on bucket_type (human bucket looks for human, dog bucket looks for dog)
UPDATE photos SET target_type = 'human' WHERE bucket_type = 'human' AND (target_type IS NULL OR target_type = '');
UPDATE photos SET target_type = 'dog' WHERE bucket_type = 'dog' AND (target_type IS NULL OR target_type = '');

-- Make target_type NOT NULL with constraint
ALTER TABLE photos ALTER COLUMN target_type SET DEFAULT 'human';
UPDATE photos SET target_type = COALESCE(target_type, bucket_type) WHERE target_type IS NULL;
ALTER TABLE photos ALTER COLUMN target_type SET NOT NULL;
ALTER TABLE photos ADD CONSTRAINT photos_target_type_check CHECK (target_type IN ('dog', 'human'));

-- Step 2: Remove unused columns
ALTER TABLE photos DROP COLUMN IF EXISTS ai_text;
ALTER TABLE photos DROP COLUMN IF EXISTS ai_metadata;
ALTER TABLE photos DROP COLUMN IF EXISTS client_labels;
ALTER TABLE photos DROP COLUMN IF EXISTS server_labels;

-- Step 3: Remove classification column (we'll use contains_dog + contains_human)
ALTER TABLE photos DROP COLUMN IF EXISTS classification;

-- Step 4: Remove contains_both column (can be computed)
ALTER TABLE photos DROP COLUMN IF EXISTS contains_both;

-- Step 5: Verify changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'photos'
ORDER BY ordinal_position;

