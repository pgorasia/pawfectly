# Date of Birth Migration: Text to Date Type

## Overview

Migration `041_convert_dob_to_date.sql` converts the `profiles.dob` column from text to PostgreSQL's native `date` type. This change makes age filtering cheap, reliable, and enables efficient database-level age range queries.

## Benefits

1. **Performance**: Database can use native date arithmetic and indexes
2. **Reliability**: Type safety prevents invalid dates from being stored
3. **Simplicity**: Age calculations become straightforward SQL expressions
4. **Index Efficiency**: B-tree indexes on date columns are highly optimized

## Migration Details

### Database Changes

**Before:**
```sql
profiles.dob text -- Format: mm/dd/yyyy or inconsistent
```

**After:**
```sql
profiles.dob date -- Format: YYYY-MM-DD (ISO 8601)
```

### Data Format Conventions

- **Database**: Stores dates in `YYYY-MM-DD` format (PostgreSQL date type)
- **API/JSON**: Dates are transmitted as `YYYY-MM-DD` strings
- **Frontend Display**: Dates are converted to `mm/dd/yyyy` for US users

### Code Changes

#### 1. Date Conversion Functions (`onboardingService.ts`)

Two helper functions handle conversion between display and database formats:

```typescript
// Convert mm/dd/yyyy → YYYY-MM-DD (for saving to DB)
function convertDisplayToDbDate(displayDate: string): string | null

// Convert YYYY-MM-DD → mm/dd/yyyy (for displaying to users)
function convertDbToDisplayDate(dbDate: string): string
```

#### 2. Saving to Database

All saves to `profiles.dob` now convert from display format:

```typescript
const profileData = {
  dob: convertDisplayToDbDate(human.dateOfBirth || ''),
  // ... other fields
};
```

#### 3. Loading from Database

The `MeContext.loadFromDatabase` function converts dates to display format:

```typescript
newMe.profile = {
  dob: convertDbToDisplayDate(data.profile.dob),
  // ... other fields
};
```

This ensures `me.profile.dob` is always in `mm/dd/yyyy` format throughout the app.

#### 4. Type Definitions

```typescript
// MeContext.tsx
export interface MeProfile {
  dob: string | null; // Date in mm/dd/yyyy format (converted from PostgreSQL date)
  // ... other fields
}
```

## Age Filtering in SQL

### Basic Age Calculation

```sql
SELECT 
  user_id,
  display_name,
  calculate_age(dob) as age
FROM profiles;
```

### Filter by Age Range (25-35 years old)

```sql
SELECT * FROM profiles 
WHERE dob BETWEEN CURRENT_DATE - INTERVAL '35 years' 
              AND CURRENT_DATE - INTERVAL '25 years';
```

### Using Helper Function

```sql
SELECT * FROM profiles 
WHERE is_age_in_range(dob, 25, 35);
```

### Minimum Age Filter

```sql
-- Show only users 21 or older
SELECT * FROM profiles 
WHERE dob <= CURRENT_DATE - INTERVAL '21 years';
```

## Future: Adding Age Filters to Feed

The feed functions (`get_feed_candidates`, `get_feed_page`) can now easily add age filtering:

```sql
CREATE OR REPLACE FUNCTION public.get_feed_candidates(
  p_limit int default 20,
  p_min_age int default 18,
  p_max_age int default 100
)
...
WHERE p.dob BETWEEN 
  CURRENT_DATE - INTERVAL '1 year' * p_max_age 
  AND CURRENT_DATE - INTERVAL '1 year' * p_min_age
```

This uses the indexed `dob` column for fast filtering.

## Testing

### Verify Migration

```sql
-- Check column type
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'dob';
-- Should return: dob | date

-- Check existing data converted correctly
SELECT user_id, dob, calculate_age(dob) as age 
FROM profiles 
WHERE dob IS NOT NULL 
LIMIT 10;
```

### Test Age Constraints

```sql
-- Try to insert invalid date (should fail)
INSERT INTO profiles (user_id, dob) 
VALUES ('test-user-id', '2020-01-01'); -- Too young (< 18)
-- Should fail with: profiles_dob_reasonable_age constraint violation

-- Try to insert valid date (should succeed)
INSERT INTO profiles (user_id, dob) 
VALUES ('test-user-id', '2000-01-01'); -- 24 years old
```

## Rollback Plan

If issues arise, the migration can be reversed:

```sql
-- Add temporary text column
ALTER TABLE profiles ADD COLUMN dob_text text;

-- Convert date back to text (mm/dd/yyyy format)
UPDATE profiles 
SET dob_text = TO_CHAR(dob, 'MM/DD/YYYY')
WHERE dob IS NOT NULL;

-- Drop date column and rename text column
ALTER TABLE profiles DROP COLUMN dob;
ALTER TABLE profiles RENAME COLUMN dob_text TO dob;
```

## Notes

- The migration handles null values safely
- Invalid dates in old data are converted to NULL
- Age constraint ensures only 18-100 year olds can have profiles
- Index on `dob` improves query performance for age filtering
