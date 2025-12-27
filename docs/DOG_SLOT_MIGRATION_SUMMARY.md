# Dog Slot Migration Summary

## Overview
Replaced dog1/dog2/dog3 string indexing with stable `dog_slot` (INT 1-3) for photo mapping.

## SQL Migration
**File:** `scripts/supabase/migrations/017_add_dog_slot.sql`

### Changes:
1. Added `dog_slot INT NULL` column to `photos` table
2. Added index on `(user_id, dog_slot)`
3. Added CHECK constraint: `dog_slot IS NULL OR (dog_slot >= 1 AND dog_slot <= 3)`
4. If `dogs` table exists: added `slot INT` column with unique index on `(user_id, slot)` and CHECK constraint

## Files Changed

### Database Schema
- `scripts/supabase/migrations/017_add_dog_slot.sql` - NEW migration file

### Type Definitions
- `types/photo.ts` - Added `dog_slot: number | null` to Photo interface
- `hooks/useProfileDraft.tsx` - Added `slot: number` to DogProfile interface

### Photo Service
- `services/supabase/photoService.ts`:
  - `getDogPhotos()`: Now queries by `dog_slot` instead of `dog_id`
  - `getHumanPhotos()`: Now queries by `dog_slot IS NULL` instead of `dog_id = 'NA'`
  - Added `deletePhotosByDogSlot()`: Deletes all photos for a specific slot

### Photo Upload
- `services/media/resizeAndUploadPhoto.ts`:
  - Added `dogSlot` parameter (replaces `dogId`)
  - `generateStoragePath()`: Uses slot number instead of dogId string
  - Photo insert: Sets `dog_slot` instead of `dog_id`
  
- `services/media/photoUpload.ts`:
  - Added `dogSlot` parameter to `UploadPhotoWithValidationParams`

### Photo Buckets Hook
- `hooks/usePhotoBuckets.tsx`:
  - Changed from `dogIds: string[]` to `dogSlots: number[]`
  - `dogBuckets`: Changed from `Record<string, PhotoBucketState>` to `Record<number, PhotoBucketState>`
  - All methods now use `dogSlot: number` instead of `dogId: string`
  - `getDogPhotos()` calls now pass slot numbers

- `hooks/usePhotoValidation.tsx`:
  - `dogBuckets` type changed from `Record<string, PhotoBucketState>` to `Record<number, PhotoBucketState>`

### UI Components
- `app/(profile)/photos.tsx`:
  - Changed from `dogIds` array (string) to `dogSlots` array (number)
  - Dogs sorted by slot ascending
  - All photo operations use `dog.slot` instead of index-based `dogId`

- `app/(profile)/dogs.tsx`:
  - Initial dog state: Assigns slot = 1 for first dog
  - `handleAddDog()`: Assigns lowest available slot (1-3)
  - `handleRemoveDog()`: Calls `deletePhotosByDogSlot()` to clear photos for that slot

### Dog Management
- `hooks/useProfileDraft.tsx`:
  - `addDog()`: Automatically assigns lowest available slot (1-3)

## Key Behaviors

### Slot Assignment
- New dogs get lowest available slot (1, 2, or 3)
- Slots are never renumbered (stable)
- Maximum 3 dogs (slots 1-3)

### Photo Mapping
- Dog photos: `dog_slot` = 1, 2, or 3
- Human photos: `dog_slot` = NULL
- Photo buckets query by `dog_slot`

### Dog Deletion
- On delete: All photos with matching `dog_slot` are deleted
- Deletes both database records and storage files
- Slot becomes available for reuse

### Photo Queries
- `getDogPhotos(userId, slot)`: Queries `photos.dog_slot = slot`
- `getHumanPhotos(userId)`: Queries `photos.dog_slot IS NULL`
- Buckets always match correct dog after adds/deletes

## Notes
- `dog_id` column kept for backwards compatibility (deprecated)
- Migration is backwards compatible (allows NULL dog_slot initially)
- Breaking changes: All photo queries now use slots instead of string IDs

