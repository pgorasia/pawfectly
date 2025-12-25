# Photo Upload + AI Validation - Implementation Summary

## Overview
Fresh implementation of photo upload module with bucket-based UI, non-distorting compression, and AI validation with hard-block rules.

## Architecture

### Services

#### 1. `resizeAndUploadPhoto.ts`
- **Purpose**: Handles image compression and upload to Supabase Storage
- **Features**:
  - Maintains aspect ratio (no distortion)
  - Downscales only if long edge > 1440px
  - Compresses to JPEG quality 0.75
  - Uploads to Supabase Storage bucket "photos"
- **Input**: `{ localUri, userId, bucketName, dogId?, bucketType, supabaseClient }`
- **Output**: `{ publicUrl, storagePath, width, height }`

#### 2. `photoValidation.ts`
- **Purpose**: Handles local and server-side photo validation
- **Features**:
  - Local validation using TensorFlow.js + COCO-SSD
  - Server validation fallback (Supabase Edge Function)
  - Detects "person" and "dog" with confidence >= 0.5
- **Functions**:
  - `initLocalDetector()`: Initializes COCO-SSD model (singleton)
  - `validatePhotoLocal(localUri)`: Runs local validation
  - `validatePhotoServer(imageUrl, supabaseClient)`: Runs server validation

#### 3. `photoDbService.ts`
- **Purpose**: Database operations for photos and trust badges
- **Functions**:
  - `createPhotoRecord()`: Inserts photo record with kind ("dog"|"human"|"both")
  - `awardTrustBadge()`: Awards "human_with_dog_photo" badge
  - `getUserPhotos()`: Fetches all user photos
  - `deletePhoto()`: Deletes photo record and storage file

### Hooks

#### 1. `usePhotoUpload.tsx`
- **Purpose**: Manages photo upload flow with validation
- **Features**:
  - Handles image picking
  - Runs local validation first
  - Falls back to server validation if local fails
  - Enforces hard-block rules per bucket
  - Creates DB records and awards trust badges
- **Returns**: `{ dogBuckets, humanBucket, uploadPhotoToBucket, removePhoto, hasBothPhoto, refreshPhotos }`

#### 2. `usePhotoRequirements.tsx`
- **Purpose**: Validates photo requirements for Next button
- **Rules**:
  - At least 1 dog photo total
  - At least 1 human photo total
  - OR: a "both" photo counts for both requirements
- **Returns**: `{ canProceed, dogCount, humanCount, hasBothPhoto, errors }`

### Components

#### 1. `DogPhotoBucket.tsx`
- Displays photo grid for a single dog
- Shows upload progress and errors
- Displays "both" badge indicator
- Updated to use `PhotoRecord` type

#### 2. `HumanPhotoBucket.tsx`
- Displays photo grid for human photos
- Shows trust badge indicator
- Updated to use `PhotoRecord` type

### Screen

#### `app/(profile)/photos.tsx`
- Integrates all components and hooks
- Shows validation errors
- Displays progress
- Enables/disables Next button based on requirements

## Validation Flow

1. **User picks image** → `pickImage()`
2. **Local validation** → `validatePhotoLocal()`
   - If fails with `LOCAL_DETECTOR_FAILED` → proceed to upload, then server validation
   - If fails with missing label → **HARD BLOCK** (reject, don't upload)
   - If passes → proceed to upload
3. **Compress & Upload** → `resizeAndUploadPhoto()`
4. **Server validation** (if local failed) → `validatePhotoServer()`
5. **Create DB record** → `createPhotoRecord()`
6. **Award trust badge** (if kind="both") → `awardTrustBadge()`

## Hard Block Rules

- **Dog bucket**: Must detect "dog" label → reject if not found
- **Human bucket**: Must detect "person" label → reject if not found
- **Both detection**: If dog-bucket photo has both → counts for human requirement too

## Database Schema

Photos table includes:
- `id`, `user_id`, `dog_id`, `bucket_type`, `storage_path`
- `width`, `height`, `created_at`
- `classification` (DOG_ONLY, HUMAN_ONLY, HUMAN_AND_DOG)
- `contains_dog`, `contains_human`, `contains_both`
- `kind` (derived: "dog" | "human" | "both")

## Trust Badges

- Badge type: `"human_with_dog_photo"`
- Awarded when: User has at least 1 photo with `kind="both"`
- Stored in: `trust_badges` table

## Next Button Logic

Enabled when:
- `dogCount >= 1` AND
- `(humanCount >= 1 OR hasBothPhoto)`

## Server Validation

- Edge Function: `supabase/functions/photo-validate/index.ts`
- Currently returns `NOT_IMPLEMENTED`
- TODO: Integrate real validation provider (Google Cloud Vision, AWS Rekognition, etc.)

## Testing

1. Upload dog photo → should detect dog, allow upload
2. Upload human photo → should detect person, allow upload
3. Upload "both" photo → should detect both, award badge, satisfy both requirements
4. Upload invalid photo → should reject with error message
5. Try Next button → should enable only when requirements met

## Notes

- Compression maintains aspect ratio (no distortion)
- Images downscaled only if > 1440px on long edge
- Local validation uses TensorFlow.js (works best in Expo Web)
- Server validation is fallback when local detector fails
- All photos stored in `photos` bucket with path: `${userId}/${dogId|human}/${uuid}.jpg`

