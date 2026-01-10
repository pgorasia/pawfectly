-- ============================================================================
-- Migration: Add helper functions for age-based filtering
-- These functions leverage the new date type for profiles.dob
-- ============================================================================

-- Helper function to calculate age from date of birth
CREATE OR REPLACE FUNCTION public.calculate_age(dob date)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob))::int;
$$;

-- Helper function to check if someone is within an age range
CREATE OR REPLACE FUNCTION public.is_age_in_range(
  dob date,
  min_age int,
  max_age int
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT 
    CASE 
      WHEN dob IS NULL THEN false
      ELSE 
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob)) >= min_age
        AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, dob)) <= max_age
    END;
$$;

-- Add index for efficient age range queries
-- This supports queries like: WHERE dob BETWEEN date1 AND date2
CREATE INDEX IF NOT EXISTS idx_profiles_dob_btree 
ON public.profiles USING btree(dob) 
WHERE dob IS NOT NULL;

-- ============================================================================
-- Usage examples:
-- 
-- Get age of a profile:
-- SELECT calculate_age(dob) as age FROM profiles WHERE user_id = '...';
--
-- Filter profiles by age range (25-35):
-- SELECT * FROM profiles 
-- WHERE dob BETWEEN CURRENT_DATE - INTERVAL '35 years' 
--               AND CURRENT_DATE - INTERVAL '25 years';
--
-- Or using the helper function:
-- SELECT * FROM profiles 
-- WHERE is_age_in_range(dob, 25, 35);
--
-- Filter by minimum age only:
-- SELECT * FROM profiles WHERE dob <= CURRENT_DATE - INTERVAL '25 years';
-- ============================================================================
