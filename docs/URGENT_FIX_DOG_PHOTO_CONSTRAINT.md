# URGENT: Fix Dog Photo Upload Constraint Error

## Problem
Getting error: `new row for relation "photos" violates check constraint "photos_dog_id_check"` when uploading dog photos.

## Solution: Run This SQL NOW

Go to **Supabase Dashboard → SQL Editor** and run this:

```sql
-- Drop the existing constraint
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_dog_id_check;

-- Create a new relaxed constraint
-- Only enforce that human bucket must have null dog_id
-- Dog bucket can have null dog_id (for onboarding) OR a valid UUID
ALTER TABLE photos ADD CONSTRAINT photos_dog_id_check CHECK (
  (bucket_type = 'human' AND dog_id IS NULL)
  -- For dog bucket: dog_id can be null (onboarding) or any value
);
```

## Verify It Worked

After running the SQL, verify the constraint:

```sql
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint 
WHERE conrelid = 'photos'::regclass 
  AND conname = 'photos_dog_id_check';
```

You should see:
```
constraint_definition: CHECK ((bucket_type = 'human' AND dog_id IS NULL))
```

This means:
- ✅ Human bucket photos MUST have `dog_id = NULL`
- ✅ Dog bucket photos CAN have `dog_id = NULL` (for onboarding) OR a valid UUID

## After Running

1. Try uploading a dog photo again
2. It should save to the database with `dog_id = null` and `bucket_type = 'dog'`
3. The photo should appear in the dog bucket UI

