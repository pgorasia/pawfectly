/**
 * Hook for managing photo buckets (dog and human)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  deletePhoto,
  reorderPhotosAfterDeletion,
} from '@/services/supabase/photoService';
import { uploadPhotoWithValidation } from '@/services/media/photoUpload';
import { pickImage } from '@/services/media/imagePicker';
import { resizeAndUploadPhoto } from '@/services/media/resizeAndUploadPhoto';
import { supabase } from '@/services/supabase/supabaseClient';
import { sendPhotoRejectedNotification } from '@/services/notifications/photoNotifications';
import type { Photo, BucketType } from '@/types/photo';

export interface PhotoBucketState {
  photos: Photo[];
  isUploading: boolean;
  uploadError: string | null;
}

export interface UsePhotoBucketsReturn {
  dogBuckets: Record<number, PhotoBucketState>; // Key is slot number (1, 2, or 3)
  humanBucket: PhotoBucketState;
  uploadPhotoToBucket: (
    bucketType: BucketType,
    dogSlot?: number,
    imageUri?: string,
    croppedUri?: string
  ) => Promise<void>;
  removePhoto: (photoId: string, bucketType: BucketType, dogSlot?: number) => Promise<void>;
  replacePhoto: (photoId: string, bucketType: BucketType, dogSlot?: number) => Promise<void>;
  hasHumanDogPhoto: boolean;
  refreshPhotos: () => Promise<void>;
}

/**
 * Hook to manage photo buckets for all dogs and human
 * dogSlots: array of slot numbers (1, 2, or 3) for each dog
 */
export function usePhotoBuckets(dogSlots: number[]): UsePhotoBucketsReturn {
  const { user } = useAuth();
  const [dogBuckets, setDogBuckets] = useState<Record<number, PhotoBucketState>>({});
  const [humanBucket, setHumanBucket] = useState<PhotoBucketState>({
    photos: [],
    isUploading: false,
    uploadError: null,
  });
  const [hasHumanDogPhoto, setHasHumanDogPhoto] = useState(false);

  // Initialize dog buckets
  useEffect(() => {
    const initialBuckets: Record<number, PhotoBucketState> = {};
    dogSlots.forEach((slot) => {
      initialBuckets[slot] = {
        photos: [],
        isUploading: false,
        uploadError: null,
      };
    });
    setDogBuckets(initialBuckets);
  }, [dogSlots]);

  // Load all photos from Supabase in a single query, then group client-side
  const refreshPhotos = useCallback(async () => {
    try {
      if (!user?.id) return;
      const userId = user.id;

      // Single query: load all photos for user, ordered by dog_slot (nulls first for human) and display_order
      const { data: allPhotos, error } = await supabase
        .from('photos')
        .select('*')
        .eq('user_id', userId)
        .order('dog_slot', { ascending: true, nullsFirst: true }) // Human photos (null) come first
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false }); // Fallback for photos without display_order

      if (error) {
        throw new Error(`Failed to fetch photos: ${error.message}`);
      }

      const photos = (allPhotos || []) as Photo[];

      // Group photos client-side into buckets
      const dogBucketsData: Record<number, PhotoBucketState> = {};
      let humanPhotos: Photo[] = [];

      for (const photo of photos) {
        if (photo.dog_slot !== null && photo.bucket_type === 'dog') {
          // Dog photo - group by slot
          const slot = photo.dog_slot;
          if (!dogBucketsData[slot]) {
            dogBucketsData[slot] = {
              photos: [],
              isUploading: false,
              uploadError: null,
            };
          }
          dogBucketsData[slot].photos.push(photo);
        } else if (photo.dog_slot === null && photo.bucket_type === 'human') {
          // Human photo
          humanPhotos.push(photo);
        }
      }

      // Initialize empty buckets for dog slots that have no photos
      dogSlots.forEach((slot) => {
        if (!dogBucketsData[slot]) {
          dogBucketsData[slot] = {
            photos: [],
            isUploading: false,
            uploadError: null,
          };
        }
      });

      setDogBuckets(dogBucketsData);
      setHumanBucket({
        photos: humanPhotos,
        isUploading: false,
        uploadError: null,
      });

      // Check for human+dog photos (from any bucket)
      // contains_both is computed as: contains_dog && contains_human
      const allPhotosArray = Object.values(dogBucketsData).flatMap((b) => b.photos);
      const hasHumanDog = allPhotosArray.some((photo) => photo.contains_dog && photo.contains_human) || 
                          humanPhotos.some((photo) => photo.contains_dog && photo.contains_human);
      setHasHumanDogPhoto(hasHumanDog);
    } catch (error) {
      console.error('Failed to refresh photos:', error);
    }
  }, [dogSlots, user?.id]);

  // Load photos on mount and when user changes
  useEffect(() => {
    if (user?.id) {
      refreshPhotos();
    }
  }, [user?.id, refreshPhotos]);

  // Debounce timer for realtime updates
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPhotoUpdatesRef = useRef<Map<string, Photo>>(new Map());

  // Debounced refresh function that batches rapid updates
  const debouncedRefresh = useCallback(() => {
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
    }
    refreshDebounceRef.current = setTimeout(() => {
      refreshPhotos();
      pendingPhotoUpdatesRef.current.clear();
      refreshDebounceRef.current = null;
    }, 300); // 300ms debounce
  }, [refreshPhotos]);

  // Patch a single photo in state instead of full refresh (for rapid updates)
  const patchPhotoInState = useCallback((photo: Photo) => {
    const slot = photo.dog_slot;
    const isHuman = slot === null && photo.bucket_type === 'human';
    const isDog = slot !== null && photo.bucket_type === 'dog';

    if (isDog && slot !== null) {
      setDogBuckets((prev) => {
        const bucket = prev[slot];
        if (!bucket) return prev;
        
        const existingIndex = bucket.photos.findIndex((p) => p.id === photo.id);
        if (existingIndex >= 0) {
          // Update existing photo
          const newPhotos = [...bucket.photos];
          newPhotos[existingIndex] = photo;
          return {
            ...prev,
            [slot]: {
              ...bucket,
              photos: newPhotos,
            },
          };
        } else {
          // New photo - add to end (will be sorted on next full refresh)
          return {
            ...prev,
            [slot]: {
              ...bucket,
              photos: [...bucket.photos, photo],
            },
          };
        }
      });
    } else if (isHuman) {
      setHumanBucket((prev) => {
        const existingIndex = prev.photos.findIndex((p) => p.id === photo.id);
        if (existingIndex >= 0) {
          // Update existing photo
          const newPhotos = [...prev.photos];
          newPhotos[existingIndex] = photo;
          return {
            ...prev,
            photos: newPhotos,
          };
        } else {
          // New photo - add to end (will be sorted on next full refresh)
          return {
            ...prev,
            photos: [...prev.photos, photo],
          };
        }
      });
    }

    // Update human+dog flag if needed
    if (photo.contains_dog && photo.contains_human) {
      setHasHumanDogPhoto(true);
    }
  }, []);

  // Set up realtime subscription for photo status changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('photo-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'photos',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedPhoto = payload.new as Photo;
          const oldPhoto = payload.old as Photo;

          // Check if photo status changed to rejected
          if (updatedPhoto.status === 'rejected' && oldPhoto.status !== 'rejected') {
            console.log('[usePhotoBuckets] Photo rejected:', updatedPhoto.id);
            
            // Send notification
            sendPhotoRejectedNotification(updatedPhoto.id, updatedPhoto.rejection_reason || null).catch(
              (error) => {
                console.error('[usePhotoBuckets] Failed to send notification:', error);
              }
            );

            // Patch photo immediately for responsive UI
            patchPhotoInState(updatedPhoto);
            
            // Also trigger debounced refresh to ensure consistency
            debouncedRefresh();
          } else if (updatedPhoto.status !== oldPhoto.status) {
            // Status changed (approved or pending) - patch immediately
            patchPhotoInState(updatedPhoto);
            
            // Debounce full refresh to batch rapid updates
            pendingPhotoUpdatesRef.current.set(updatedPhoto.id, updatedPhoto);
            debouncedRefresh();
          } else {
            // Other field changes - patch immediately without debounce
            patchPhotoInState(updatedPhoto);
          }
        }
      )
      .subscribe();

    return () => {
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshPhotos, debouncedRefresh, patchPhotoInState]);

  const uploadPhotoToBucket = useCallback(
    async (bucketType: BucketType, dogSlot?: number, imageUri?: string, croppedUri?: string) => {
      // Set uploading state
      if (bucketType === 'dog' && dogSlot) {
        setDogBuckets((prev) => ({
          ...prev,
          [dogSlot]: {
            ...prev[dogSlot],
            isUploading: true,
            uploadError: null,
          },
        }));
      } else {
        setHumanBucket((prev) => ({
          ...prev,
          isUploading: true,
          uploadError: null,
        }));
      }

      try {
        if (!user?.id) {
          throw new Error('User not authenticated');
        }

        // Use the dedicated photo upload service
        // Pass userId from AuthContext to avoid network call
        const result = await uploadPhotoWithValidation({
          bucketType,
          dogSlot,
          imageUri, // Pass imageUri if provided (from cropper)
          croppedUri, // Pass croppedUri if provided (already cropped)
          userId: user.id,
        });

        if (!result.success || !result.photo) {
          // User cancelled or upload failed - reset state
          if (bucketType === 'dog' && dogSlot) {
            setDogBuckets((prev) => ({
              ...prev,
              [dogSlot]: {
                ...prev[dogSlot],
                isUploading: false,
                uploadError: result.error || null,
              },
            }));
          } else {
            setHumanBucket((prev) => ({
              ...prev,
              isUploading: false,
              uploadError: result.error || null,
            }));
          }
          return;
        }

        // display_order is automatically set by database trigger (see migration 025)
        // No need to fetch next order or update - it's already set in result.photo

        // Upload successful - update state with new photo (at the end)
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              photos: [...prev[dogSlot].photos, result.photo!],
              isUploading: false,
              uploadError: null,
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            photos: [...prev.photos, result.photo!],
            isUploading: false,
            uploadError: null,
          }));
        }

        // Update human+dog flag (contains_both is computed as contains_dog && contains_human)
        if (result.photo.contains_dog && result.photo.contains_human) {
          setHasHumanDogPhoto(true);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to upload photo';

        // Handle session expiration - redirect to auth
        if (errorMessage.includes('Session expired') || errorMessage.includes('not authenticated')) {
          const { router } = await import('expo-router');
          const { Alert } = await import('react-native');
          
          Alert.alert(
            'Session Expired',
            'Please sign in again to continue.',
            [
              {
                text: 'Sign In',
                onPress: () => {
                  router.replace('/(auth)');
                },
              },
            ]
          );
        }

        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              ...prev[dogSlot],
              isUploading: false,
              uploadError: errorMessage,
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            isUploading: false,
            uploadError: errorMessage,
          }));
        }
      }
    },
    [dogSlots, user]
  );

  const removePhoto = useCallback(
    async (photoId: string, bucketType: BucketType, dogSlot?: number) => {
      try {
        if (!user?.id) return;

        // Get the photo's display_order before deleting
        let deletedDisplayOrder: number | null = null;
        if (bucketType === 'dog' && dogSlot) {
          const photo = dogBuckets[dogSlot]?.photos.find(p => p.id === photoId);
          deletedDisplayOrder = photo?.display_order ?? null;
        } else {
          const photo = humanBucket.photos.find(p => p.id === photoId);
          deletedDisplayOrder = photo?.display_order ?? null;
        }

        await deletePhoto(photoId, user.id);

        // Reorder remaining photos (move all following photos up by 1)
        if (deletedDisplayOrder !== null) {
          await reorderPhotosAfterDeletion(user.id, bucketType, deletedDisplayOrder, dogSlot);
        }

        // Update state
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              ...prev[dogSlot],
              photos: prev[dogSlot].photos.filter((p) => p.id !== photoId),
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            photos: prev.photos.filter((p) => p.id !== photoId),
          }));
        }

        // Refresh to check human+dog status and get updated display_order
        await refreshPhotos();
      } catch (error) {
        console.error('Failed to remove photo:', error);
      }
    },
    [refreshPhotos, user, dogBuckets, humanBucket]
  );

  const replacePhoto = useCallback(
    async (photoId: string, bucketType: BucketType, dogSlot?: number) => {
      try {
        if (!user?.id) return;

        // Step 1: Open image picker first
        const pickedImage = await pickImage({
          allowsEditing: false,
          quality: 0.8,
        });

        // If user cancelled, do nothing - keep the old photo
        if (!pickedImage) {
          return;
        }

        // Step 2: Set uploading state
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              ...prev[dogSlot],
              isUploading: true,
              uploadError: null,
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            isUploading: true,
            uploadError: null,
          }));
        }

        // Step 3: Get the old photo's display_order to preserve it
        let preservedDisplayOrder: number | null = null;
        if (bucketType === 'dog' && dogSlot) {
          const oldPhoto = dogBuckets[dogSlot]?.photos.find(p => p.id === photoId);
          preservedDisplayOrder = oldPhoto?.display_order ?? null;
        } else {
          const oldPhoto = humanBucket.photos.find(p => p.id === photoId);
          preservedDisplayOrder = oldPhoto?.display_order ?? null;
        }

        // Step 4: Delete the old photo
        await deletePhoto(photoId, user.id);

        // Step 5: Update state to remove old photo
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              ...prev[dogSlot],
              photos: prev[dogSlot].photos.filter((p) => p.id !== photoId),
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            photos: prev.photos.filter((p) => p.id !== photoId),
          }));
        }

        // Step 6: Upload the new photo
        // Use userId from AuthContext (no network call)
        if (!user?.id) {
          throw new Error('User not authenticated');
        }
        const uploadResult = await resizeAndUploadPhoto({
          localUri: pickedImage.uri,
          userId: user.id,
          bucketType,
          dogSlot,
          mimeType: pickedImage.type,
        });

        // Step 7: Preserve the display_order from the old photo
        // Note: The trigger sets display_order automatically, but we want to preserve the old position
        const photo = uploadResult.photo;
        if (preservedDisplayOrder !== null) {
          await supabase
            .from('photos')
            .update({ display_order: preservedDisplayOrder })
            .eq('id', photo.id);
        }

        const photoWithOrder = { ...photo, display_order: preservedDisplayOrder };

        // Step 9: Update state with new photo (in the same position)
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => {
            const currentPhotos = prev[dogSlot]?.photos || [];
            // Insert at the same position based on display_order
            const sortedPhotos = [...currentPhotos, photoWithOrder].sort((a, b) => {
              const orderA = a.display_order ?? 0;
              const orderB = b.display_order ?? 0;
              return orderA - orderB;
            });
            return {
              ...prev,
              [dogSlot]: {
                photos: sortedPhotos,
                isUploading: false,
                uploadError: null,
              },
            };
          });
        } else {
          setHumanBucket((prev) => {
            const sortedPhotos = [...prev.photos, photoWithOrder].sort((a, b) => {
              const orderA = a.display_order ?? 0;
              const orderB = b.display_order ?? 0;
              return orderA - orderB;
            });
            return {
              ...prev,
              photos: sortedPhotos,
              isUploading: false,
              uploadError: null,
            };
          });
        }

        // Update human+dog flag if needed
        if (photo.contains_dog && photo.contains_human) {
          setHasHumanDogPhoto(true);
        }

        console.log(`[usePhotoBuckets] ✅ Photo replaced. New photo ${photo.id} uploaded.`);
      } catch (error) {
        console.error('Failed to replace photo:', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to replace photo';

        // Reset uploading state on error
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              ...prev[dogSlot],
              isUploading: false,
              uploadError: errorMessage,
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            isUploading: false,
            uploadError: errorMessage,
          }));
        }
      }
    },
    [user]
  );

  return {
    dogBuckets,
    humanBucket,
    uploadPhotoToBucket,
    removePhoto,
    replacePhoto,
    hasHumanDogPhoto,
    refreshPhotos,
  };
}

