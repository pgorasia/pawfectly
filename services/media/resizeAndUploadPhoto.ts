/**
 * Photo Resize and Upload Service
 * Handles image validation, resizing, and upload to Supabase Storage + database
 * 
 * Pipeline:
 * 1. Validate file is image (mime starts with "image/")
 * 2. Resize to longest side 512px (maintain aspect ratio)
 * 3. Compress to JPEG quality 0.82
 * 4. Upload to Supabase Storage
 * 5. Insert row into photos table with status='pending'
 */

import { manipulateAsync, SaveFormat, Action } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../supabase/supabaseClient';

export interface ResizeAndUploadPhotoParams {
  userId: string;
  bucketType: 'human' | 'dog';
  dogSlot?: number; // Slot number (1-3) for dog photos
  localUri: string;
  fileName?: string;
  mimeType?: string;
  // Deprecated: dogId kept for backwards compatibility, use dogSlot instead
  dogId?: string;
  // Optional: If provided, this URI is already cropped and ready for resize/upload
  croppedUri?: string;
}

export interface ResizeAndUploadPhotoResult {
  photoRowId: string;
  storagePath: string;
  width: number;
  height: number;
}

const MAX_LONG_EDGE = 512;
const JPEG_QUALITY = 0.82;
const BUCKET_NAME = 'photos';

/**
 * Validates that the file is an image based on MIME type
 * Only validates if mimeType is provided
 * Handles cases where mimeType might be just "image" (from expo-image-picker)
 */
function validateImageMimeType(mimeType: string): void {
  // Normalize: if it's just "image", that's fine (expo-image-picker sometimes returns this)
  // Also accept "image/" prefix
  const normalized = mimeType.toLowerCase().trim();
  if (normalized !== 'image' && !normalized.startsWith('image/')) {
    throw new Error(`File must be an image. Received MIME type: ${mimeType}`);
  }
}

/**
 * Converts image URI to Uint8Array for upload
 * For React Native/Expo, we use expo-file-system to read as base64, then convert to Uint8Array
 */
async function imageUriToBlob(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    // Web: fetch directly and convert to Uint8Array
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to read image file: ${response.statusText}`);
    }
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } else {
    // React Native (including Expo Go): use expo-file-system
    // Read file as base64 - using string literal 'base64' (ReadingOptions accepts both enum and string)
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64',
    });

    // Convert base64 to Uint8Array using standard base64 decoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const lookup: number[] = new Array(256).fill(-1);
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i;
    }

    let bufferLength = base64.length * 0.75;
    if (base64.length > 0) {
      if (base64[base64.length - 1] === '=') {
        bufferLength--;
        if (base64.length > 1 && base64[base64.length - 2] === '=') {
          bufferLength--;
        }
      }
    }

    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < base64.length; i += 4) {
      const encoded1 = lookup[base64.charCodeAt(i)] ?? 0;
      const encoded2 = i + 1 < base64.length ? (lookup[base64.charCodeAt(i + 1)] ?? 0) : 0;
      const encoded3 = i + 2 < base64.length ? (lookup[base64.charCodeAt(i + 2)] ?? 64) : 64;
      const encoded4 = i + 3 < base64.length ? (lookup[base64.charCodeAt(i + 3)] ?? 64) : 64;

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      if (p < bufferLength) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      if (p < bufferLength) bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return bytes;
  }
}

/**
 * Generates deterministic storage path
 * Format: users/{userId}/{bucketType}/{dogSlot-or-human}/{timestamp}_{random}.jpg
 * - Human: users/{userId}/human/NA/{timestamp}_{random}.jpg
 * - Dog: users/{userId}/dog/{slot}/{timestamp}_{random}.jpg (slot is 1, 2, or 3)
 */
function generateStoragePath(
  userId: string,
  bucketType: 'human' | 'dog',
  dogSlot?: number
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9); // 7 random chars
  const folder = bucketType === 'human' ? 'NA' : (dogSlot?.toString() || '1');
  return `users/${userId}/${bucketType}/${folder}/${timestamp}_${random}.jpg`;
}

/**
 * Resizes and uploads a photo to Supabase Storage, then creates a database record
 * 
 * Steps:
 * 1. Validate MIME type is image/*
 * 2. Get original dimensions
 * 3. Resize to longest side 512px (maintain aspect ratio)
 * 4. Compress to JPEG quality 0.82
 * 5. Convert to blob
 * 6. Upload to Supabase Storage
 * 7. Insert row into photos table with status='pending'
 */
export async function resizeAndUploadPhoto(
  params: ResizeAndUploadPhotoParams
): Promise<ResizeAndUploadPhotoResult> {
  const { userId, bucketType, dogSlot, localUri, mimeType, dogId, croppedUri } = params;

  try {
    // Step 1: Validate MIME type
    if (mimeType) {
      validateImageMimeType(mimeType);
    }

    // Use cropped URI if provided, otherwise use original
    const sourceUri = croppedUri || localUri;

    // Step 2: Get image dimensions (no manipulation, just read metadata)
    const originalInfo = await manipulateAsync(sourceUri, [], {
      format: undefined,
    });
    
    const originalWidth = originalInfo.width;
    const originalHeight = originalInfo.height;
    const originalLongEdge = Math.max(originalWidth, originalHeight);

    // Step 3: Calculate resize dimensions (maintain aspect ratio)
    let finalWidth = originalWidth;
    let finalHeight = originalHeight;
    const actions: Action[] = [];

    if (originalLongEdge > MAX_LONG_EDGE) {
      // Calculate scale factor to make longest side = 512px
      const scale = MAX_LONG_EDGE / originalLongEdge;
      finalWidth = Math.round(originalWidth * scale);
      finalHeight = Math.round(originalHeight * scale);

      actions.push({
        resize: {
          width: finalWidth,
          height: finalHeight,
        },
      });
    }

    // Step 4: Resize and compress to JPEG quality 0.82
    const manipulatedResult = await manipulateAsync(sourceUri, actions, {
      compress: JPEG_QUALITY,
      format: SaveFormat.JPEG,
    });

    // Step 5: Convert to Uint8Array for upload
    let fileData: Uint8Array;
    try {
      fileData = await imageUriToBlob(manipulatedResult.uri);
      console.log(`[resizeAndUploadPhoto] Successfully converted image to Uint8Array, size: ${fileData.byteLength} bytes`);
    } catch (blobError) {
      console.error('[resizeAndUploadPhoto] Failed to convert image to Uint8Array:', blobError);
      throw new Error(`Failed to prepare image for upload: ${blobError instanceof Error ? blobError.message : String(blobError)}`);
    }

    // Step 6: Generate storage path (use dogSlot if provided, fallback to dogId for backwards compatibility)
    const effectiveDogSlot = dogSlot || (dogId ? parseInt(dogId.replace('dog', '')) : undefined);
    const storagePath = generateStoragePath(userId, bucketType, effectiveDogSlot);
    console.log(`[resizeAndUploadPhoto] Uploading to path: ${storagePath}`);

    // Step 7: Verify we have a valid session before uploading
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('[resizeAndUploadPhoto] Session error:', sessionError);
      throw new Error(`Failed to verify session: ${sessionError.message}`);
    }
    if (!session) {
      throw new Error('No active session. Please sign in again.');
    }
    console.log(`[resizeAndUploadPhoto] Session verified, user: ${session.user.id}`);
    
    // Check Supabase URL is accessible (basic connectivity check)
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('EXPO_PUBLIC_SUPABASE_URL is not set');
      }
      console.log(`[resizeAndUploadPhoto] Supabase URL configured: ${supabaseUrl.substring(0, 30)}...`);
    } catch (configError) {
      console.error('[resizeAndUploadPhoto] Configuration error:', configError);
      throw new Error('Supabase configuration error. Please check your environment variables.');
    }

    // Step 8: Upload to Supabase Storage
    console.log(`[resizeAndUploadPhoto] Starting upload to bucket: ${BUCKET_NAME}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, fileData, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      console.error('[resizeAndUploadPhoto] Upload error details:', {
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        error: uploadError,
      });
      throw new Error(`Failed to upload photo to storage: ${uploadError.message}${uploadError.statusCode ? ` (${uploadError.statusCode})` : ''}`);
    }

    console.log(`[resizeAndUploadPhoto] ✅ Successfully uploaded to storage: ${uploadData.path}`);

    // Step 8: Insert row into photos table with status='pending'
    // - Human photos: dog_slot = NULL
    // - Dog photos: dog_slot = 1, 2, or 3 (based on slot)
    // target_type: what to look for (same as bucket_type: 'human' bucket looks for 'human', 'dog' bucket looks for 'dog')
    const validDogSlot = bucketType === 'human' ? null : (dogSlot || (dogId ? parseInt(dogId.replace('dog', '')) : null));
    const targetType = bucketType; // target_type matches bucket_type

    const { data: photo, error: insertError } = await supabase
      .from('photos')
      .insert({
        user_id: userId,
        dog_slot: validDogSlot,
        bucket_type: bucketType,
        target_type: targetType,
        storage_path: storagePath,
        width: finalWidth,
        height: finalHeight,
        mime_type: 'image/jpeg',
        status: 'pending',
        contains_dog: false,
        contains_human: false,
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create photo record: ${insertError.message}`);
    }

    return {
      photoRowId: photo.id,
      storagePath,
      width: finalWidth,
      height: finalHeight,
    };
  } catch (error) {
    // Re-throw with helpful error message
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to resize and upload photo: ${String(error)}`);
  }
}
