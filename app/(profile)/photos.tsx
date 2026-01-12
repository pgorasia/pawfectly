/**
 * Photos Upload Page
 * Allows users to upload photos for their dogs and themselves
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ProgressBar } from '@/components/common/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { DogPhotoBucket } from '@/components/dog/DogPhotoBucket';
import { HumanPhotoBucket } from '@/components/human/HumanPhotoBucket';
import { CropperModal } from '@/components/media/CropperModal';
import { useCropperModal } from '@/hooks/useCropperModal';
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { usePhotoBuckets } from '@/hooks/usePhotoBuckets';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { dbDogToDogProfile } from '@/services/supabase/onboardingService';
import { markSubmitted, setLastStep, getOrCreateOnboarding } from '@/services/profile/statusRepository';
import { pickImage } from '@/services/media/imagePicker';
import { uploadPhotoWithValidation } from '@/services/media/photoUpload';
import { cropImage } from '@/services/media/cropImage';
import { resizeAndUploadPhoto } from '@/services/media/resizeAndUploadPhoto';
import { getCurrentUserId } from '@/services/supabase/photoService';
import { supabase } from '@/services/supabase/supabaseClient';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

export default function PhotosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { me } = useMe();
  const { draft, updateDogs } = useProfileDraft();

  // Cropper modal hook
  const { isOpen, imageUri, openCropper, closeCropper, handleConfirm } = useCropperModal();

  // Load dogs from database if draft is empty (especially important for corrective action)
  React.useEffect(() => {
    const loadDogsIfNeeded = async () => {
      if (!user?.id || draft.dogs.length > 0) return;
      
      try {
        // Load dogs from database
        const { data: dogs, error } = await supabase
          .from('dogs')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('slot', { ascending: true });
        
        if (error) {
          console.error('[PhotosScreen] Failed to load dogs:', error);
          return;
        }
        
        if (dogs && dogs.length > 0) {
          // Merge dogs into draft context without resetting other draft sections
          updateDogs(dogs.map(dbDogToDogProfile));
        }
      } catch (error) {
        console.error('[PhotosScreen] Failed to load dogs:', error);
      }
    };

    loadDogsIfNeeded();
  }, [user?.id, draft.dogs.length, updateDogs]);

  // Compute corrective action status from cached values in MeContext
  const lifecycleStatus = me.profile?.lifecycle_status;
  const validationStatus = me.profile?.validation_status;
  const isCorrectiveAction = lifecycleStatus && 
    (lifecycleStatus === 'pending_review' || lifecycleStatus === 'limited' || lifecycleStatus === 'blocked') &&
    (validationStatus === 'failed_requirements' || validationStatus === 'failed_photos');

  // Set current step when page loads or when user navigates back to this screen
  // Only update onboarding_status if lifecycle_status is 'onboarding' (or profile doesn't exist - new user)
  // Uses cached lifecycle_status from MeContext instead of DB query
  React.useEffect(() => {
    if (!user?.id) return;
    
    // Only update onboarding_status if lifecycle_status is 'onboarding' (or profile doesn't exist - new user)
    if (!lifecycleStatus || lifecycleStatus === 'onboarding') {
      // First ensure the row exists, then set the step
      // Pass userId from context to avoid network call
      getOrCreateOnboarding(user?.id ?? null)
        .then(() => setLastStep(user.id, 'photos'))
        .catch((error) => {
          console.error('[PhotosScreen] Failed to set current step:', error);
        });
    } else {
      console.log(
        `[PhotosScreen] Skipping onboarding_status update - lifecycle_status is '${lifecycleStatus}', not 'onboarding'`
      );
    }
  }, [user?.id, lifecycleStatus]);

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
  } = usePhotoBuckets(dogSlots);

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
        console.error('[PhotosScreen] Failed to pick image:', error);
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
        console.error('[PhotosScreen] Failed to pick image for replace:', error);
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
        console.error('[PhotosScreen] Failed to crop and upload:', error);
      }
    },
    [imageUri, closeCropper, uploadPhotoToBucket, removePhoto, user]
  );

  // Check if submit/continue button should be enabled
  // Enabled only if:
  // - Each bucket has at least one photo
  // - No rejected photos exist (rejected photos must be removed/replaced)
  const canSubmit = useMemo(() => {
    // Check if all dog buckets have at least one photo
    const allDogsHavePhotos = dogSlots.every((slot) => {
      const bucket = dogBuckets[slot];
      return bucket && bucket.photos.length > 0;
    });

    // Check if human bucket has at least one photo
    const humanHasPhotos = humanBucket.photos.length > 0;

    // Check if any photo is rejected (must be removed/replaced before submitting)
    const hasRejectedPhotos = 
      Object.values(dogBuckets).some((bucket) =>
        bucket.photos.some((photo) => photo.status === 'rejected')
      ) || humanBucket.photos.some((photo) => photo.status === 'rejected');

    return allDogsHavePhotos && humanHasPhotos && !hasRejectedPhotos;
  }, [dogBuckets, humanBucket, dogSlots]);

  const handleContinue = () => {
    if (!canSubmit || !user?.id) return;
    
    // Mark onboarding step as submitted and advance to preferences step (only during onboarding)
    markSubmitted(user.id, 'photos').catch((error) => {
      console.error('[PhotosScreen] Failed to mark onboarding step as submitted:', error);
      // Don't block navigation on error
    });
    
    router.push('/(profile)/connection-style');
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user?.id) return;

    // Onboarding submit: mark onboarding step as submitted, then route to feed
    if (!isCorrectiveAction) {
      try {
        await markSubmitted(user.id, 'photos');
      } catch (error) {
        console.error('[PhotosScreen] Failed to mark onboarding step as submitted:', error);
        // Don't block navigation on error
      }
    }
    // Corrective submit: no server calls, just route to feed immediately

    // Navigate to feed
    router.replace('/(tabs)');
  };

  return (
    <ScreenContainer>
      {/* Only show progress bar during onboarding */}
      {!isCorrectiveAction && (
        <ProgressBar
          currentStep={3}
          totalSteps={4}
          stepTitles={['Your Pack', 'Little about you', 'Photos', 'Preferences']}
        />
      )}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {/* Only show back button during onboarding */}
            {!isCorrectiveAction && (
              <TouchableOpacity
                onPress={() => router.push('/(profile)/human')}
                style={styles.backButton}
              >
                <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
              </TouchableOpacity>
            )}
          </View>
          <AppText variant="heading" style={styles.title}>
            Add Photos
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            {isCorrectiveAction 
              ? 'Please fix your photos to continue'
              : 'Upload photos of yourself and your dogs'
            }
          </AppText>
        </View>

        {/* Dog Photos - same order as dogs page */}
        {draft.dogs.map((dog) => {
          // Use bucket if it exists, otherwise use empty bucket state
          const bucket = dogBuckets[dog.slot] || {
            photos: [],
            isUploading: false,
            uploadError: null,
          };

          return (
            <DogPhotoBucket
              key={dog.id}
              dogName={dog.name || 'Unnamed Dog'}
              dogId={dog.slot.toString()}
              bucket={bucket}
              onUpload={() => handleUploadWithCropper('dog', dog.slot)}
              onRemove={(photoId) => removePhoto(photoId, 'dog', dog.slot)}
              onReplace={(photoId) => handleReplaceWithCropper(photoId, 'dog', dog.slot)}
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
        />

        {/* Cropper Modal */}
        <CropperModal
          visible={isOpen}
          imageUri={imageUri || ''}
          onCancel={closeCropper}
          onConfirm={handleCropperConfirm}
        />

        <View style={styles.buttonContainer}>
          <AppButton 
            variant="primary" 
            onPress={isCorrectiveAction ? handleSubmit : handleContinue} 
            style={styles.button}
            disabled={!canSubmit}
          >
            {isCorrectiveAction ? 'Submit' : 'Continue'}
          </AppButton>
        </View>
      </ScrollView>
    </ScreenContainer>
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
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    opacity: 0.7,
  },
  buttonContainer: {
    marginTop: Spacing.lg,
  },
  button: {
    width: '100%',
  },
});

