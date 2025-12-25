# Running Database Migrations

## Quick Fix: Add Missing Columns

If you're getting errors about missing columns like `mime_type`, run these migrations in order:

### Step 1: Run Migration 002 (Add missing columns)

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
-- See: scripts/supabase/migrations/002_update_photos_schema_final.sql
```

This adds:
- `mime_type` column
- `rejection_reason` column
- `ai_labels` column
- `ai_text` column
- `updated_at` column
- Updates status constraint to use 'approved' instead of 'validated'
- Updates trust_badges table

### Step 2: Run Migration 004 (is_user_live function)

```sql
-- See: scripts/supabase/migrations/004_is_user_live_function.sql
```

### Step 3: Run Storage Policies (Migration 008)

```sql
-- See: scripts/supabase/migrations/008_storage_policies_final.sql
```

## Migration Order

Run migrations in this order:
1. `001_create_photos_and_trust_badges.sql` - Create tables (if not already run)
2. `002_update_photos_schema_final.sql` - Add missing columns (including mime_type)
3. `003_setup_storage_rls.sql` - Photos table RLS (if not already done)
4. `004_is_user_live_function.sql` - Profile live gating function
5. `008_storage_policies_final.sql` - Storage bucket policies

