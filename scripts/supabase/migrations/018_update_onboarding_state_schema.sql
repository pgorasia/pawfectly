-- Migration: Update onboarding_state table to replace pack_completed with dog_completed and human_completed
-- This separates dog and human onboarding completion tracking

-- Add new columns
ALTER TABLE onboarding_state
ADD COLUMN IF NOT EXISTS dog_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS human_completed BOOLEAN DEFAULT false;

-- Migrate existing data: if pack_completed was true, set both dog_completed and human_completed to true
-- This assumes that if pack was completed, both dog and human were completed
UPDATE onboarding_state
SET 
  dog_completed = COALESCE(pack_completed, false),
  human_completed = COALESCE(pack_completed, false)
WHERE pack_completed IS NOT NULL;

-- Set default for existing rows that might have NULL values
UPDATE onboarding_state
SET 
  dog_completed = COALESCE(dog_completed, false),
  human_completed = COALESCE(human_completed, false)
WHERE dog_completed IS NULL OR human_completed IS NULL;

-- Make columns NOT NULL after setting defaults
ALTER TABLE onboarding_state
ALTER COLUMN dog_completed SET NOT NULL,
ALTER COLUMN human_completed SET NOT NULL,
ALTER COLUMN dog_completed SET DEFAULT false,
ALTER COLUMN human_completed SET DEFAULT false;

-- Drop the old pack_completed column
ALTER TABLE onboarding_state
DROP COLUMN IF EXISTS pack_completed;

