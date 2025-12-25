# Photo Upload Module Setup

This document outlines the setup required for the Photo Upload + AI Validation module.

## Required Dependencies

The following npm packages need to be installed:

```bash
npm install expo-image-picker expo-image-manipulator
```

### Package Details:
- `expo-image-picker`: For selecting images from device gallery/camera
- `expo-image-manipulator`: For compressing and resizing images before upload

## Supabase Setup

### 1. Storage Bucket

**IMPORTANT: The storage bucket must be created before uploading photos!**

Create a storage bucket named `photos` in your Supabase project:

**Option A: Using Supabase Dashboard (Recommended)**
1. Go to Supabase Dashboard → Storage
2. Click "Create Bucket"
3. Name: `photos`
4. Public: **true** (or configure RLS policies for public read access)
5. File size limit: 10MB (or as needed)
6. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
7. Click "Create bucket"

**Option B: Using Script**
```bash
# Set environment variables
export SUPABASE_URL=your_supabase_url
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Run the script
node scripts/supabase/create-storage-bucket.js
```

**After creating the bucket, set up RLS policies:**
- Go to Storage → photos → Policies
- See `scripts/supabase/create-storage-bucket.sql` for policy examples
- At minimum, allow authenticated users to upload and public read access

### 2. Database Migration

Run the migration SQL file to create the required tables:

```bash
# File location: scripts/supabase/migrations/001_create_photos_and_trust_badges.sql
```

Run this SQL in your Supabase SQL editor. This creates:
- `photos` table with all required columns and indexes
- `trust_badges` table for tracking user badges
- Row Level Security (RLS) policies

### 3. Environment Variables

Ensure these are set in your `.env` file:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_ENV` (optional, defaults to 'development')

## AI Detector Configuration

The module uses a pluggable AI detector interface. Currently, a mock detector is implemented.

### Mock Detector Modes

Set `EXPO_PUBLIC_MOCK_AI_MODE` in your `.env` to control mock behavior:
- `always_dog`: Always detects dog
- `always_human`: Always detects human
- `always_both`: Always detects both
- `auto` (default): Uses simple filename heuristics

### Replacing with Real Detector

To use a real on-device ML model:
1. Install your preferred ML library (e.g., TensorFlow Lite, MediaPipe)
2. Update `services/ai/detector.ts`
3. Replace `MockEntityDetector` with your implementation
4. Update the export: `export const entityDetector = new RealEntityDetector()`

## Testing

### Manual Testing Checklist

1. **Dog Photo Upload**
   - Upload a photo to a dog bucket
   - Verify AI validation runs
   - Verify photo appears in grid
   - Verify photo is saved to Supabase

2. **Human Photo Upload**
   - Upload a photo to human bucket
   - Verify AI validation runs
   - Verify photo appears in grid

3. **Validation Gates**
   - Try to proceed without dog photos → should be blocked
   - Try to proceed without human photos → should be blocked
   - Upload human+dog photo to dog bucket → should unlock "Next" button

4. **Trust Badge**
   - Upload a photo with both human and dog
   - Verify trust badge is awarded
   - Verify badge indicator appears in UI

5. **Error Handling**
   - Upload non-dog image to dog bucket → should show error
   - Upload non-human image to human bucket → should show error

## Server-Side Validation (Future)

The module is designed to support server-side validation later:

1. Create a Supabase Edge Function for photo validation
2. Update `photoService.ts` → `validatePhotoServerSide()` function
3. Implement a queue system to process photos asynchronously
4. Update `canEnterFeed()` to check server validation status

## Troubleshooting

### Images not displaying
- Check that storage bucket is public or RLS policies allow read access
- Verify storage path is correct in database records

### Upload fails
- Check Supabase storage bucket exists and is accessible
- Verify user is authenticated
- Check network connectivity

### AI validation always fails
- Check `EXPO_PUBLIC_MOCK_AI_MODE` setting
- Verify detector implementation is correct

