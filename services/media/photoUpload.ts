/**
 * Photo Upload Service
 * Handles photo upload with async AI moderation via Supabase Edge Function
 * 
 * Flow:
 * 1. User picks image
 * 2. Image is resized/compressed
 * 3. Image is uploaded to Supabase Storage
 * 4. Photo record is created with status 'pending'
 * 5. Async AI moderation is triggered via Edge Function
 * 6. Photo status is updated when moderation completes
 */

import { pickImage } from './imagePicker';
import { resizeAndUploadPhoto } from './resizeAndUploadPhoto';
import type { Photo, BucketType } from '@/types/photo';

export interface UploadPhotoWithValidationParams {
  bucketType: BucketType;
  dogSlot?: number; // Slot number (1-3) for dog photos
  // Deprecated: dogId kept for backwards compatibility, use dogSlot instead
  dogId?: string;
  // Note: Validation is now automatic via DB webhook - no manual trigger needed
  // Optional: If imageUri is provided, skip image picker and use this URI directly
  imageUri?: string;
  // Optional: If croppedUri is provided, use this already-cropped image for upload
  croppedUri?: string;
  // User ID from AuthContext (avoids network call)
  userId: string;
}

export interface UploadPhotoResult {
  success: boolean;
  photo?: Photo;
  error?: string;
}

/**
 * Uploads a photo with async AI moderation
 * 
 * Steps:
 * 1. Pick image from device (or use provided imageUri)
 * 2. Resize and compress image
 * 3. Upload to Supabase Storage
 * 4. Create photo record with status 'pending'
 * 5. (Optional) Trigger async server-side validation
 */
export async function uploadPhotoWithValidation(
  params: UploadPhotoWithValidationParams
): Promise<UploadPhotoResult> {
  const { bucketType, dogSlot, dogId, imageUri, croppedUri, userId } = params;

  try {
    let pickedImage: { uri: string; type?: string } | null = null;

    // Step 1: Pick image from device or use provided URI
    if (imageUri) {
      // Use provided image URI (e.g., from cropper)
      pickedImage = { uri: imageUri };
    } else {
      // Pick image from device
      const picked = await pickImage({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!picked) {
        // User cancelled
        return { success: false };
      }
      pickedImage = picked;
    }

    // Step 2: Resize, upload to Storage, and create photo record
    // userId is provided from AuthContext (no network call)
    // resizeAndUploadPhoto already creates the DB record and returns the full photo object
    const uploadResult = await resizeAndUploadPhoto({
      localUri: pickedImage.uri,
      croppedUri, // Use cropped image if provided
      userId,
      bucketType,
      dogSlot,
      mimeType: pickedImage.type || 'image/jpeg',
    });

    // Step 4: Validation is now triggered automatically by DB webhook on INSERT
    // No need to manually trigger - the webhook will call the edge function
    // display_order is automatically set by database trigger (see migration 025)
    console.log(`[PhotoUpload] ✅ Photo ${uploadResult.photo.id} uploaded. Validation will be triggered automatically by webhook.`);

    return {
      success: true,
      photo: uploadResult.photo,
    };
  } catch (error) {
    console.error('[PhotoUpload] Upload failed:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to upload photo';
    return {
      success: false,
      error: errorMessage,
    };
  }
}

