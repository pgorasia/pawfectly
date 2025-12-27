/**
 * Hook for managing photo buckets (dog and human)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getUserPhotos,
  getDogPhotos,
  getHumanPhotos,
  deletePhoto,
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
    dogSlot?: number
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
    async (bucketType: BucketType, dogSlot?: number) => {
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

        // Upload successful - update state with new photo
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

        if (bucketType === 'dog' && dogId) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogId]: {
              ...prev[dogId],
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

        await deletePhoto(photoId, user.id);

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

        // Refresh to check human+dog status
        await refreshPhotos();
      } catch (error) {
        console.error('Failed to remove photo:', error);
      }
    },
    [refreshPhotos, user]
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

        // Step 3: Delete the old photo
        await deletePhoto(photoId, user.id);

        // Step 4: Update state to remove old photo
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

        // Step 5: Upload the new photo
        const userId = await getCurrentUserId();
        const uploadResult = await resizeAndUploadPhoto({
          localUri: pickedImage.uri,
          userId,
          bucketType,
          dogSlot,
          mimeType: pickedImage.type,
        });

        // Step 6: Fetch the newly created photo record
        const { data: photo, error: fetchError } = await supabase
          .from('photos')
          .select('*')
          .eq('id', uploadResult.photoRowId)
          .single();

        if (fetchError || !photo) {
          throw new Error(`Failed to fetch newly created photo record: ${fetchError?.message}`);
        }

        // Step 7: Update state with new photo
        if (bucketType === 'dog' && dogSlot) {
          setDogBuckets((prev) => ({
            ...prev,
            [dogSlot]: {
              photos: [...prev[dogSlot].photos, photo],
              isUploading: false,
              uploadError: null,
            },
          }));
        } else {
          setHumanBucket((prev) => ({
            ...prev,
            photos: [...prev.photos, photo],
            isUploading: false,
            uploadError: null,
          }));
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

