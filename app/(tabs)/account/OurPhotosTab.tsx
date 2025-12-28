/**
 * Our Photos Tab - Replica of Photos onboarding page for editing
 * All changes are autosaved
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { DogPhotoBucket } from '@/components/dog/DogPhotoBucket';
import { HumanPhotoBucket } from '@/components/human/HumanPhotoBucket';
import { CropperModal } from '@/components/media/CropperModal';
import { useCropperModal } from '@/hooks/useCropperModal';
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { usePhotoBuckets } from '@/hooks/usePhotoBuckets';
import { useAuth } from '@/contexts/AuthContext';
import { pickImage } from '@/services/media/imagePicker';
import { cropImage } from '@/services/media/cropImage';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

export default function OurPhotosTab() {
  const { draft } = useProfileDraft();
  const { user } = useAuth();

  // Cropper modal hook
  const { isOpen, imageUri, openCropper, closeCropper } = useCropperModal();

  // Use slot numbers (1, 2, 3) for dog photos
  const dogSlots = useMemo(() => {
    return draft.dogs.map(dog => dog.slot).filter(slot => slot >= 1 && slot <= 3);
  }, [draft.dogs]);

  const {
    dogBuckets,
    humanBucket,
    uploadPhotoToBucket,
    removePhoto,
    replacePhoto,
    hasHumanDogPhoto,
    reorderPhotos,
    savePendingReordersIfNeeded,
  } = usePhotoBuckets(dogSlots);

  // Save pending reorders when user leaves this tab
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        // On blur (user leaving tab) - save pending reorders
        savePendingReordersIfNeeded().catch((err: unknown) => {
          console.warn('[OurPhotosTab] Failed to save pending reorders on tab switch:', err);
        });
      };
    }, [savePendingReordersIfNeeded])
  );

  // Also save on component unmount (when switching to different tab in Account section)
  React.useEffect(() => {
    return () => {
      savePendingReordersIfNeeded().catch((err: unknown) => {
        console.warn('[OurPhotosTab] Failed to save pending reorders on unmount:', err);
      });
    };
  }, [savePendingReordersIfNeeded]);

  // Store pending upload info for after cropper confirms
  const pendingUploadRef = React.useRef<{
    bucketType: 'human' | 'dog';
    dogSlot?: number;
    photoId?: string; // For replace operations
  } | null>(null);

  // Wrapper function that shows cropper before uploading
  const handleUploadWithCropper = React.useCallback(
    async (bucketType: 'human' | 'dog', dogSlot?: number) => {
      try {
        // Step 1: Pick image
        const pickedImage = await pickImage({
          allowsEditing: false,
          quality: 0.8,
        });

        if (!pickedImage) {
          // User cancelled image picker
          return;
        }

        // Step 2: Show cropper modal
        pendingUploadRef.current = { bucketType, dogSlot };
        await openCropper(pickedImage.uri);
      } catch (error) {
        console.error('[OurPhotosTab] Failed to pick image:', error);
      }
    },
    [openCropper]
  );

  // Wrapper function that shows cropper before replacing
  const handleReplaceWithCropper = React.useCallback(
    async (photoId: string, bucketType: 'human' | 'dog', dogSlot?: number) => {
      try {
        // Step 1: Pick image
        const pickedImage = await pickImage({
          allowsEditing: false,
          quality: 0.8,
        });

        if (!pickedImage) {
          // User cancelled image picker
          return;
        }

        // Step 2: Show cropper modal with replace context
        pendingUploadRef.current = { bucketType, dogSlot, photoId };
        await openCropper(pickedImage.uri);
      } catch (error) {
        console.error('[OurPhotosTab] Failed to pick image for replace:', error);
      }
    },
    [openCropper]
  );

  // Handle cropper confirmation - crop image and upload
  const handleCropperConfirm = React.useCallback(
    async (transform: { scale: number; translateX: number; translateY: number }) => {
      if (!pendingUploadRef.current || !imageUri) {
        closeCropper();
        return;
      }

      const { bucketType, dogSlot, photoId } = pendingUploadRef.current;
      const currentImageUri = imageUri;
      pendingUploadRef.current = null;

      // Close cropper first
      closeCropper();

      try {
        // Step 1: Crop the image based on transform
        const croppedUri = await cropImage({
          imageUri: currentImageUri,
          transform,
        });

        // Step 2: If replacing, delete old photo first
        if (photoId && user?.id) {
          await removePhoto(photoId, bucketType, dogSlot);
        }

        // Step 3: Upload the cropped image using uploadPhotoToBucket
        // Pass both original URI (for reference) and cropped URI (for upload)
        await uploadPhotoToBucket(bucketType, dogSlot, currentImageUri, croppedUri);
      } catch (error) {
        console.error('[OurPhotosTab] Failed to crop and upload:', error);
      }
    },
    [imageUri, closeCropper, uploadPhotoToBucket, removePhoto, user]
  );

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <AppText variant="heading" style={styles.title}>
          Add Photos
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Upload photos of yourself and your dogs
        </AppText>
      </View>

      {/* Dog Photos - same order as dogs page */}
      {draft.dogs.map((dog) => {
        const bucket = dogBuckets[dog.slot];
        if (!bucket) return null;

        return (
          <DogPhotoBucket
            key={dog.id}
            dogName={dog.name || 'Unnamed Dog'}
            dogId={dog.slot.toString()}
            bucket={bucket}
            onUpload={() => handleUploadWithCropper('dog', dog.slot)}
            onRemove={(photoId) => removePhoto(photoId, 'dog', dog.slot)}
            onReplace={(photoId) => handleReplaceWithCropper(photoId, 'dog', dog.slot)}
            onReorder={(photoIds) => reorderPhotos(photoIds, 'dog', dog.slot)}
          />
        );
      })}

      {/* Human Photos */}
      <HumanPhotoBucket
        bucket={humanBucket}
        onUpload={() => handleUploadWithCropper('human')}
        onRemove={(photoId) => removePhoto(photoId, 'human')}
        onReplace={(photoId) => handleReplaceWithCropper(photoId, 'human')}
        hasHumanDogPhoto={hasHumanDogPhoto}
        onReorder={(photoIds) => reorderPhotos(photoIds, 'human')}
      />

      {/* Cropper Modal */}
      <CropperModal
        visible={isOpen}
        imageUri={imageUri || ''}
        onCancel={closeCropper}
        onConfirm={handleCropperConfirm}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    opacity: 0.7,
  },
});

