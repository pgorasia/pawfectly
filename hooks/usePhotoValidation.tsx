/**
 * Hook for photo validation and gate checking
 */

import { useMemo } from 'react';
import type { PhotoBucketState } from './usePhotoBuckets';

export interface ValidationResult {
  canProceed: boolean;
  errors: string[];
  warnings: string[];
  dogPhotosCount: number;
  humanPhotosCount: number;
}

/**
 * Validates photo buckets against requirements
 * Rules:
 * - At least 1 dog photo (from dog buckets with contains_dog=true)
 * - At least 1 human photo (from human bucket OR any photo with contains_both=true)
 */
export function usePhotoValidation(
  dogBuckets: Record<number, PhotoBucketState>,
  humanBucket: PhotoBucketState,
  hasHumanDogPhoto: boolean
): ValidationResult {
  return useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Count dog photos (from dog buckets with contains_dog=true)
    // Only count photos that are NOT NEITHER/UNKNOWN
    let dogPhotosCount = 0;
    const dogSlots = Object.keys(dogBuckets).map(Number);
    for (const slot of dogSlots) {
      const bucket = dogBuckets[slot];
      const validDogPhotos = bucket.photos.filter(
        (photo) => 
          photo.contains_dog && 
          photo.status !== 'rejected'
          // Note: classification removed - we only check contains_dog
      );
      dogPhotosCount += validDogPhotos.length;

      // Check each dog has at least 1 photo
      if (validDogPhotos.length === 0) {
        errors.push(`Please add at least one photo for this dog`);
      } else if (bucket.photos.length > 3) {
        warnings.push(`This dog has more than 3 photos (${bucket.photos.length})`);
      }
    }

    // Count human photos (ONLY from human bucket OR photos with contains_both=true)
    // Important: Don't count dog bucket photos that only have contains_human=true
    // Human photos must be either:
    // 1. In the human bucket with contains_human=true (and NOT NEITHER/UNKNOWN), OR
    // 2. Any photo (from any bucket) with contains_both=true
    
    const validHumanPhotos = humanBucket.photos.filter(
      (photo) => 
        photo.contains_human && 
        photo.status !== 'rejected'
        // Note: classification removed - we only check contains_human
    );
    let humanPhotosCount = validHumanPhotos.length;

    // Check if any photo (from any bucket) has contains_dog && contains_human (computed contains_both)
    // These count as human photos regardless of which bucket they're in
    const allPhotos = Object.values(dogBuckets).flatMap((b) => b.photos);
    const humanDogPhotos = allPhotos.filter(
      (photo) => 
        photo.contains_dog && photo.contains_human && 
        photo.status !== 'rejected'
        // Note: contains_both removed - computed as contains_dog && contains_human
    );
    if (humanDogPhotos.length > 0) {
      humanPhotosCount += humanDogPhotos.length; // Count human+dog photos as human photos
    }

    // Check human requirement
    if (humanPhotosCount === 0) {
      errors.push('Please add at least one photo of yourself, or upload a photo with you and your dog together');
    }

    // Can proceed if: at least 1 dog photo AND at least 1 human photo (or human+dog photo)
    const canProceed = dogPhotosCount >= 1 && humanPhotosCount >= 1 && errors.length === 0;

    return {
      canProceed,
      errors,
      warnings,
      dogPhotosCount,
      humanPhotosCount,
    };
  }, [dogBuckets, humanBucket]);
}

