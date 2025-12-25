# Photos Table Schema Cleanup Summary

## Changes Made

### Removed Columns
1. `ai_text` - Unused
2. `ai_metadata` - Unused  
3. `client_labels` - Unused
4. `server_labels` - Unused
5. `classification` - Redundant (can be computed from `contains_dog` + `contains_human`)
6. `contains_both` - Redundant (can be computed as `contains_dog && contains_human`)

### Added Columns
1. `target_type` (TEXT, NOT NULL) - Determines what to look for:
   - `'human'` for human bucket photos
   - `'dog'` for dog bucket photos
   - Set automatically based on `bucket_type` on INSERT

## Updated Logic

### Classification (computed)
Instead of storing `classification`, compute it from `contains_dog` and `contains_human`:
- `HUMAN_AND_DOG`: `contains_dog = true AND contains_human = true`
- `DOG_ONLY`: `contains_dog = true AND contains_human = false`
- `HUMAN_ONLY`: `contains_dog = false AND contains_human = true`
- `NEITHER`: `contains_dog = false AND contains_human = false`

### Contains Both (computed)
Instead of storing `contains_both`, compute it as:
- `contains_both = contains_dog && contains_human`

### Target Type Usage
The `target_type` column determines validation rules:
- If `target_type = 'human'`: Approve if `hasHuman = true`, reject if `hasHuman = false`
- If `target_type = 'dog'`: Approve if `hasDog = true`, reject if `hasDog = false`

## Code Updates

### TypeScript Types
- Removed: `PhotoClassification`, `ClientLabels`, `ServerLabels`, `DetectorResult`
- Updated `Photo` interface to remove: `classification`, `contains_both`, `client_labels`, `server_labels`
- Added: `target_type: TargetType` to `Photo` interface

### Edge Function
- Uses `target_type` instead of `bucket_type` for validation logic
- Sets `contains_dog` and `contains_human` only (no `contains_both` or `classification`)
- Special error message for dog photos with human but no dog

### Client Code
- `contains_both` references changed to `contains_dog && contains_human`
- `photo.contains_both` → `photo.contains_dog && photo.contains_human`

## Migration

Run `scripts/supabase/migrations/016_cleanup_photos_schema.sql` or `scripts/supabase/RUN_THIS_NOW.sql`

