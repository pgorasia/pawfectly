# Selfie Verification Implementation

## Overview
This document outlines the selfie verification feature implementation. The feature allows users to verify their identity by matching a selfie to one of their profile photos using on-device face matching.

## Completed Components

### 1. Database Schema ✅
- **Migration**: `048_add_selfie_verification.sql`
  - Added `profiles.selfie_verified_at` (timestamptz)
  - Added `profiles.selfie_verified_method` (text, default 'on_device_v1')
  - Added `profiles.selfie_verified_photo_id` (uuid, references photos.id)
  - Added `trust_badges.metadata` (JSONB) for badge-specific data
  - Created `selfie_verification_attempts` table for rate limiting
  - Created RPC function `can_attempt_selfie_verification()` for atomic attempt tracking
  - Added triggers to automatically revoke verification when verified photo is deleted/replaced

### 2. Badge Service ✅
- **File**: `services/badges/badgeService.ts`
  - `getBadgeStatuses()` - Fetch all badge statuses
  - `getBadgeStatus()` - Get specific badge status
  - `canAttemptSelfieVerification()` - Check rate limits
  - `getEligibleHumanPhotos()` - Get photos eligible for verification
  - `completeSelfieVerification()` - Complete verification and update badges
  - `isPhotoVerified()` - Check if a photo is verified

### 3. UI Components ✅
- **MyBadgesTab** (`app/(tabs)/account/index.tsx`)
  - Updated with new badge layout (checkbox, title, trophy, info icon)
  - Email verified: always verified, checkmark only
  - Photo with dog: links to Our Photos tab when incomplete
  - Selfie verified: starts selfie flow when incomplete
  - Info modal for each badge explaining how to earn it
  - Completed badges are disabled

- **Selfie Verification Flow** (`app/(tabs)/account/selfie-verification.tsx`)
  - Intro screen with attempt limit info
  - Photo selection screen (shows eligible human photos)
  - Camera screen (placeholder - needs VisionCamera integration)
  - Result screen (success/failure)

- **Badge Indicators** (`components/human/HumanPhotoBucket.tsx`)
  - Shows verified badge icon on verified photos
  - Badge appears in top-right corner of photo

## Pending Implementation

### 1. Camera Integration (High Priority)
**Dependencies to install:**
```bash
npm install react-native-vision-camera
npm install vision-camera-face-detector
npm install react-native-fast-tflite
```

**Required setup:**
- Add camera permissions to `app.json`:
  ```json
  {
    "expo": {
      "plugins": [
        [
          "react-native-vision-camera",
          {
            "cameraPermissionText": "$(PRODUCT_NAME) needs access to your camera to verify your selfie."
          }
        ]
      ]
    }
  }
  ```

- iOS: Add camera usage description to `Info.plist`
- Android: Add camera permission to `AndroidManifest.xml`

### 2. Face Detection & Matching (High Priority)
**Implementation needed in `selfie-verification.tsx`:**

1. **Face Detection** (using MLKit via vision-camera-face-detector):
   - Detect face in camera preview (for user guidance)
   - Detect single face in captured selfie
   - Validate face quality (size, position, lighting)

2. **Face Embedding** (using TFLite):
   - Load MobileFaceNet or FaceNet model
   - Extract embeddings from:
     - Captured selfie (after face detection and alignment)
     - Selected reference photo (download and process)
   - Normalize embeddings

3. **Face Matching**:
   - Calculate cosine similarity between embeddings
   - Set threshold (typically 0.6-0.7 for face recognition)
   - Return match result

**Suggested implementation structure:**
```typescript
// services/faceMatching/faceMatchingService.ts
export async function matchFaces(
  selfieUri: string,
  referencePhotoUri: string
): Promise<{ success: boolean; similarity: number; reason?: string }> {
  // 1. Detect faces in both images
  // 2. Align and crop faces
  // 3. Extract embeddings
  // 4. Compare embeddings
  // 5. Return result
}
```

### 3. Model Files
**Required TFLite model:**
- Download MobileFaceNet or FaceNet model (`.tflite` file)
- Place in `assets/models/` directory
- Load model in app initialization

**Recommended models:**
- MobileFaceNet (smaller, faster, good for mobile)
- FaceNet (more accurate, larger)

### 4. Camera Screen Implementation
**Replace placeholder in `selfie-verification.tsx`:**

```typescript
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useFaceDetector } from 'vision-camera-face-detector';

// In component:
const device = useCameraDevice('front');
const { faces } = useFaceDetector();

// Render face frame overlay based on detected faces
// Show instructions based on face position/quality
```

## Rate Limiting

### Client-Side (Implemented ✅)
- 15-second cooldown between attempts
- Prevents rapid retries
- Shows countdown to user

### Server-Side (Implemented ✅)
- 5 attempts per hour
- 20 attempts per day
- Atomic increment via RPC function
- Prevents bypass via app reinstall/time manipulation

## Badge Revocation

### Automatic Revocation (Implemented ✅)
- Triggered when verified photo is deleted
- Triggered when verified photo status changes to 'rejected'
- Updates `profiles.selfie_verified_at` to NULL
- Removes badge from `trust_badges` table

### User Experience
- Badge indicator shown on verified photo
- User can see which photo is verified
- Deletion warning could be added (future enhancement)

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Badge statuses load correctly
- [ ] Rate limiting works (client + server)
- [ ] Badge revocation on photo deletion
- [ ] Badge indicator shows on verified photos
- [ ] Selfie flow navigation works
- [ ] Face detection in camera preview
- [ ] Face matching accuracy
- [ ] Error handling for edge cases

## Future Enhancements

1. **Liveness Detection**
   - Optional head turn prompts
   - Blink detection
   - Prevents photo spoofing

2. **Better Error Messages**
   - "Face not centered"
   - "Multiple faces detected"
   - "Try brighter light"
   - "Face too small/large"

3. **Photo Quality Checks**
   - Blur detection
   - Lighting assessment
   - Face angle validation

4. **Deletion Warning**
   - Show warning when deleting verified photo
   - "This photo is used for verification. Deleting it will revoke your badge."

## Notes

- Selfie images are **not stored** (ephemeral)
- Only embeddings are computed on-device
- No data sent to backend for matching
- Privacy-first approach
- Zero API costs for face matching
