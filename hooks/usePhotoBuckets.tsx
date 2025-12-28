/**
 * Hook for managing photo buckets (dog and human)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDogPhotos,
  getHumanPhotos,
  deletePhoto,
  updatePhotoDisplayOrder,
  getNextDisplayOrder,
  reorderPhotosAfterDeletion,
} from '@/services/supabase/photoService';
import { uploadPhotoWithValidation } from '@/services/media/photoUpload';
import { pickImage } from '@/services/media/imagePicker';
import { resizeAndUploadPhoto } from '@/services/media/resizeAndUploadPhoto';
import { supabase } from '@/services/supabase/supabaseClient';
import { getCurrentUserId } from '@/services/supabase/photoService';
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
  reorderPhotos: (photoIds: string[], bucketType: BucketType, dogSlot?: number) => void;
  savePendingReordersIfNeeded: () => Promise<void>;
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
  
  // Track pending reorder operations (photoIds that need display_order updated)
  const pendingReordersRef = useRef<Map<string, { photoIds: string[]; bucketType: BucketType; dogSlot?: number }>>(new Map());

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

  // Load photos from Supabase
  const refreshPhotos = useCallback(async () => {
    try {
      if (!user?.id) return;
      const userId = user.id;

      // Load dog photos by slot
      const dogBucketsData: Record<number, PhotoBucketState> = {};
      for (const slot of dogSlots) {
        const photos = await getDogPhotos(userId, slot);
        dogBucketsData[slot] = {
          photos,
          isUploading: false,
          uploadError: null,
        };
      }
      setDogBuckets(dogBucketsData);

      // Load human photos
      const humanPhotos = await getHumanPhotos(userId);
      setHumanBucket({
        photos: humanPhotos,
        isUploading: false,
        uploadError: null,
      });

      // Check for human+dog photos (from any bucket)
      // contains_both is computed as: contains_dog && contains_human
      const allPhotos = Object.values(dogBucketsData).flatMap((b) => b.photos);
      const hasHumanDog = allPhotos.some((photo) => photo.contains_dog && photo.contains_human) || 
                          humanPhotos.some((photo) => photo.contains_dog && photo.contains_human);
      setHasHumanDogPhoto(hasHumanDog);
    } catch (error) {
      console.error('Failed to refresh photos:', error);
    }
  }, [dogSlots]);

  // Load photos on mount and when user changes
  useEffect(() => {
    if (user?.id) {
      refreshPhotos();
    }
  }, [user?.id, refreshPhotos]);

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

            // Refresh photos to update UI
            refreshPhotos();
          } else if (updatedPhoto.status !== oldPhoto.status) {
            // Status changed (approved or pending), refresh to update UI
            refreshPhotos();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refreshPhotos]);

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
        // Use the dedicated photo upload service
        const result = await uploadPhotoWithValidation({
          bucketType,
          dogSlot,
          imageUri, // Pass imageUri if provided (from cropper)
          croppedUri, // Pass croppedUri if provided (already cropped)
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

        // Set display_order to the end (get next display_order)
        let nextDisplayOrder: number | null = null;
        if (user?.id) {
          nextDisplayOrder = await getNextDisplayOrder(user.id, bucketType, dogSlot);
          await supabase
            .from('photos')
            .update({ display_order: nextDisplayOrder })
            .eq('id', result.photo!.id);
        }

        // Update photo object with display_order
        const photoWithOrder = { ...result.photo!, display_order: nextDisplayOrder };

        // Upload successful - update state with new photo (at the end)
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              photos: [...prev[dogSlot].photos, photoWithOrder],
              isUploading: false,
              uploadError: null,
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            photos: [...prev.photos, photoWithOrder],
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
        const userId = await getCurrentUserId();
        const uploadResult = await resizeAndUploadPhoto({
          localUri: pickedImage.uri,
          userId,
          bucketType,
          dogSlot,
          mimeType: pickedImage.type,
        });

        // Step 7: Fetch the newly created photo record
        const { data: photo, error: fetchError } = await supabase
          .from('photos')
          .select('*')
          .eq('id', uploadResult.photoRowId)
          .single();

        if (fetchError || !photo) {
          throw new Error(`Failed to fetch newly created photo record: ${fetchError?.message}`);
        }

        // Step 8: Preserve the display_order from the old photo
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

  // Reorder photos - saves to database on tab switch
  const reorderPhotos = useCallback(
    (photoIds: string[], bucketType: BucketType, dogSlot?: number) => {
      if (!user?.id) return;

      // Create a unique key for this bucket
      const bucketKey = bucketType === 'dog' && dogSlot 
        ? `dog_${dogSlot}` 
        : 'human';

      // Store pending reorder (will be saved on tab switch)
      pendingReordersRef.current.set(bucketKey, { photoIds, bucketType, dogSlot });

      // Update local state immediately for responsive UI
      if (bucketType === 'dog' && dogSlot) {
        setDogBuckets((prev) => {
          const currentPhotos = prev[dogSlot]?.photos || [];
          const photoMap = new Map(currentPhotos.map(p => [p.id, p]));
          const reorderedPhotos = photoIds
            .map(id => photoMap.get(id))
            .filter((p): p is Photo => p !== undefined);
          
          // Add any photos not in the reorder list at the end
          const remainingPhotos = currentPhotos.filter(p => !photoIds.includes(p.id));
          
          return {
            ...prev,
            [dogSlot]: {
              ...prev[dogSlot],
              photos: [...reorderedPhotos, ...remainingPhotos],
            },
          };
        });
      } else {
        setHumanBucket((prev) => {
          const photoMap = new Map(prev.photos.map(p => [p.id, p]));
          const reorderedPhotos = photoIds
            .map(id => photoMap.get(id))
            .filter((p): p is Photo => p !== undefined);
          
          // Add any photos not in the reorder list at the end
          const remainingPhotos = prev.photos.filter(p => !photoIds.includes(p.id));
          
          return {
            ...prev,
            photos: [...reorderedPhotos, ...remainingPhotos],
          };
        });
      }

      console.log(`[usePhotoBuckets] Photo order updated locally, will save on tab switch`);
    },
    [user]
  );

  // Save pending reorders to database
  const savePendingReorders = useCallback(async () => {
    if (!user?.id || pendingReordersRef.current.size === 0) {
      return;
    }

    try {
      console.log('[usePhotoBuckets] Saving pending reorders to database', {
        pendingCount: pendingReordersRef.current.size,
      });
      
      // Collect all photo orders from pending reorders
      const allPhotoOrders: Array<{ photoId: string; displayOrder: number }> = [];
      
      for (const [key, { photoIds }] of pendingReordersRef.current.entries()) {
        photoIds.forEach((photoId, index) => {
          allPhotoOrders.push({
            photoId,
            displayOrder: index + 1,
          });
        });
      }

      if (allPhotoOrders.length > 0) {
        await updatePhotoDisplayOrder(allPhotoOrders);
        console.log(`[usePhotoBuckets] ✅ Saved ${allPhotoOrders.length} photo order(s) to database`);
        
        // Clear pending reorders after successful save
        pendingReordersRef.current.clear();
      }
    } catch (error) {
      console.error('[usePhotoBuckets] Failed to save pending reorders:', error);
      throw error;
    }
  }, [user?.id]);

  // Expose function to save pending reorders (called on tab switch)
  const savePendingReordersIfNeeded = useCallback(async () => {
    if (pendingReordersRef.current.size > 0) {
      await savePendingReorders();
    }
  }, [savePendingReorders]);

  return {
    dogBuckets,
    humanBucket,
    uploadPhotoToBucket,
    removePhoto,
    replacePhoto,
    hasHumanDogPhoto,
    refreshPhotos,
    reorderPhotos,
    savePendingReordersIfNeeded,
  };
}

