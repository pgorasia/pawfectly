/**
 * Photo service for Supabase storage and database operations
 */

import { supabase } from './supabaseClient';
import { getCurrentUser, getSession } from './authService';
import type {
  Photo,
  BucketType,
  PhotoStatus,
  TrustBadge,
  TrustBadgeType,
  TargetType,
} from '@/types/photo';


/**
 * Helper to get the current user ID reliably (exported for use in other services)
 */
export async function getCurrentUserId(): Promise<string> {
  // Try session first (more reliable, cached locally)
  const { data: session } = await getSession();
  if (session?.user?.id) {
    return session.user.id;
  }

  // Fallback to getUser
  const { data: user, error } = await getCurrentUser();
  if (error || !user?.id) {
    throw new Error('User not authenticated. Please sign in again.');
  }

  return user.id;
}

/**
 * Uploads an image to Supabase Storage
 */
export async function uploadImageToStorage(
  imageUri: string,
  userId: string,
  bucketType: BucketType,
  photoId: string,
  dogId?: string
): Promise<string> {
  // Determine storage path
  let storagePath: string;
  if (bucketType === 'dog' && dogId) {
    storagePath = `users/${userId}/dogs/${dogId}/${photoId}.jpg`;
  } else {
    storagePath = `users/${userId}/human/${photoId}.jpg`;
  }

  // Read file as blob
  const response = await fetch(imageUri);
  const blob = await response.blob();

  // Upload to Supabase Storage
  const { error } = await supabase.storage
    .from('photos')
    .upload(storagePath, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) {
    // Provide helpful error message for missing bucket
    if (error.message.includes('not found') || error.message.includes('Bucket not found')) {
      throw new Error(
        'Storage bucket "photos" not found. Please create it in Supabase Dashboard → Storage, or run: node scripts/supabase/create-storage-bucket.js'
      );
    }
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  return storagePath;
}


/**
 * Gets all photos for a user
 */
export async function getUserPhotos(userId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch photos: ${error.message}`);
  }

  return data || [];
}

/**
 * Gets photos for a specific dog slot
 * dogSlot: 1, 2, or 3
 */
export async function getDogPhotos(
  userId: string,
  dogSlot: number
): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('user_id', userId)
    .eq('dog_slot', dogSlot)
    .eq('bucket_type', 'dog')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch dog photos: ${error.message}`);
  }

  return data || [];
}

/**
 * Gets human photos for a user
 * Human photos have dog_slot = NULL
 */
export async function getHumanPhotos(userId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .eq('user_id', userId)
    .eq('bucket_type', 'human')
    .is('dog_slot', null)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch human photos: ${error.message}`);
  }

  return data || [];
}

/**
 * Deletes a photo (both storage and database record)
 */
export async function deletePhoto(photoId: string, userId: string): Promise<void> {
  // Get photo record first to get storage path
  const { data: photo, error: fetchError } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('id', photoId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !photo) {
    throw new Error(`Photo not found: ${fetchError?.message}`);
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('photos')
    .remove([photo.storage_path]);

  if (storageError) {
    // Don't throw if bucket doesn't exist (might be in cleanup scenario)
    if (!storageError.message.includes('not found') && !storageError.message.includes('Bucket not found')) {
      console.warn(`Failed to delete from storage: ${storageError.message}`);
    }
  }

  // Delete database record
  const { error: dbError } = await supabase
    .from('photos')
    .delete()
    .eq('id', photoId)
    .eq('user_id', userId);

  if (dbError) {
    throw new Error(`Failed to delete photo record: ${dbError.message}`);
  }
}

/**
 * Deletes all photos for a specific dog slot (used when a dog is deleted)
 */
export async function deletePhotosByDogSlot(userId: string, dogSlot: number): Promise<void> {
  // Get all photos for this slot
  const { data: photos, error: fetchError } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('dog_slot', dogSlot);

  if (fetchError) {
    throw new Error(`Failed to fetch photos for slot ${dogSlot}: ${fetchError.message}`);
  }

  if (!photos || photos.length === 0) {
    return; // No photos to delete
  }

  // Delete from storage
  const storagePaths = photos.map(p => p.storage_path).filter(Boolean);
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('photos')
      .remove(storagePaths);

    if (storageError) {
      // Don't throw if bucket doesn't exist (might be in cleanup scenario)
      if (!storageError.message.includes('not found') && !storageError.message.includes('Bucket not found')) {
        console.warn(`Failed to delete photos from storage for slot ${dogSlot}: ${storageError.message}`);
      }
    }
  }

  // Delete database records
  const { error: dbError } = await supabase
    .from('photos')
    .delete()
    .eq('user_id', userId)
    .eq('dog_slot', dogSlot);

  if (dbError) {
    throw new Error(`Failed to delete photos for slot ${dogSlot}: ${dbError.message}`);
  }
}

/**
 * Awards a trust badge to a user
 */
export async function awardTrustBadge(
  userId: string,
  badgeType: TrustBadgeType
): Promise<TrustBadge> {
  const badgeData = {
    user_id: userId,
    badge_type: badgeType,
    earned_at: new Date().toISOString(),
  };

  // Use upsert to avoid duplicates
  const { data, error } = await supabase
    .from('trust_badges')
    .upsert(badgeData, {
      onConflict: 'user_id,badge_type',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to award trust badge: ${error.message}`);
  }

  return data;
}

/**
 * Gets all trust badges for a user
 */
export async function getUserTrustBadges(userId: string): Promise<TrustBadge[]> {
  const { data, error } = await supabase
    .from('trust_badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch trust badges: ${error.message}`);
  }

  return data || [];
}

/**
 * Checks if user can enter the feed
 * Returns false if any required photo is missing OR any photo is rejected by server
 */
export async function canEnterFeed(userId: string): Promise<boolean> {
  // Get all user photos
  const photos = await getUserPhotos(userId);

  // Check if any photo is rejected
  const hasRejected = photos.some((photo) => photo.status === 'rejected');
  if (hasRejected) {
    return false;
  }

  // Check if user has at least one dog photo (from dog bucket with contains_dog=true)
  const hasDogPhoto = photos.some(
    (photo) => photo.bucket_type === 'dog' && photo.contains_dog && photo.status !== 'rejected'
  );
  if (!hasDogPhoto) {
    return false;
  }

  // Check if user has human photo OR human+dog photo (contains_dog && contains_human)
  const hasHumanPhoto = photos.some(
    (photo) => photo.bucket_type === 'human' && photo.contains_human && photo.status !== 'rejected'
  );
  const hasHumanDogPhoto = photos.some(
    (photo) => photo.contains_dog && photo.contains_human && photo.status !== 'rejected'
  );

  if (!hasHumanPhoto && !hasHumanDogPhoto) {
    return false;
  }

  return true;
}

/**
 * @deprecated This function is no longer used. Photo validation is now triggered automatically 
 * by a database webhook when a new photo is inserted. The webhook calls the validate-photo Edge Function.
 * 
 * This function is kept for backwards compatibility but should not be called.
 */
export async function validatePhotoServerSide(photoId: string): Promise<void> {
  console.warn(`[PhotoService] validatePhotoServerSide is deprecated. Validation is now automatic via webhook for photo ${photoId}`);
  // No-op: validation happens automatically via DB webhook
  return Promise.resolve();
}

/**
 * @deprecated This function is no longer used. Photo validation is now triggered automatically 
 * by a database webhook when a new photo is inserted.
 * 
 * This function is kept for backwards compatibility but should not be called.
 */
export async function triggerServerValidation(photoId: string): Promise<void> {
  console.warn(`[PhotoService] triggerServerValidation is deprecated. Validation is now automatic via webhook for photo ${photoId}`);
  // No-op: validation happens automatically via DB webhook
  return Promise.resolve();
}

