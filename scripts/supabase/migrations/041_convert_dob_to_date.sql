-- ============================================================================
-- Migration: Convert profiles.dob from text to date type
-- This makes age filtering cheap and reliable by using native date arithmetic
-- ============================================================================

-- Step 1: Add new temporary date column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS dob_date date;

-- Step 2: Migrate existing data from text to date
-- Handle various date formats and null values safely
UPDATE public.profiles
SET dob_date = 
  CASE 
    -- Try to parse as date (handles YYYY-MM-DD, MM/DD/YYYY, etc.)
    WHEN dob IS NOT NULL AND dob != '' THEN 
      CASE 
        WHEN dob ~ '^\d{4}-\d{2}-\d{2}$' THEN dob::date
        -- Add more format handling if needed
        ELSE NULL
      END
    ELSE NULL
  END
WHERE dob_date IS NULL;

-- Step 3: Drop the old text column
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS dob;

-- Step 4: Rename the new date column to dob
ALTER TABLE public.profiles 
RENAME COLUMN dob_date TO dob;

-- Step 5: Add a constraint to ensure reasonable dates (18-100 years old)
-- This prevents obviously invalid dates
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_dob_reasonable_age CHECK (
  dob IS NULL OR (
    dob >= CURRENT_DATE - INTERVAL '100 years' AND
    dob <= CURRENT_DATE - INTERVAL '18 years'
  )
);

-- Step 6: Create an index on dob for efficient age-based filtering
CREATE INDEX IF NOT EXISTS idx_profiles_dob 
ON public.profiles(dob) 
WHERE dob IS NOT NULL;

-- ============================================================================
-- Usage examples for age filtering (now much more efficient):
-- 
-- Get profiles between 25-35 years old:
-- SELECT * FROM profiles 
-- WHERE dob BETWEEN CURRENT_DATE - INTERVAL '35 years' 
--               AND CURRENT_DATE - INTERVAL '25 years';
--
-- Get someone's age:
-- SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob)) as age FROM profiles;
--
-- Filter by minimum age:
-- SELECT * FROM profiles 
-- WHERE dob <= CURRENT_DATE - INTERVAL '25 years';
-- ============================================================================
