/**
 * Photos Upload Page
 * Allows users to upload photos for their dogs and themselves
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
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
import { setCurrentStep } from '@/services/supabase/onboardingService';
import { markSubmitted, setLastStep, getOrCreateOnboarding, startValidation } from '@/services/profile/statusRepository';
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
  const { draft } = useProfileDraft();
  const [isCorrectiveAction, setIsCorrectiveAction] = React.useState(false);
  const [lifecycleStatus, setLifecycleStatus] = React.useState<string | null>(null);

  // Cropper modal hook
  const { isOpen, imageUri, openCropper, closeCropper, handleConfirm } = useCropperModal();

  // Check profile lifecycle_status and validation_status to determine if this is corrective action
  React.useEffect(() => {
    const checkProfileStatus = async () => {
      if (!user?.id) return;
      
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('lifecycle_status, validation_status')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (error && error.code !== 'PGRST116') {
          console.error('[PhotosScreen] Failed to check profile status:', error);
          return;
        }
        
        const status = profile?.lifecycle_status;
        const validationStatus = profile?.validation_status;
        setLifecycleStatus(status || null);
        
        // Determine if this is corrective action (not onboarding)
        const isCorrective = status && 
          (status === 'pending_review' || status === 'limited' || status === 'blocked') &&
          (validationStatus === 'failed_requirements' || validationStatus === 'failed_photos');
        
        setIsCorrectiveAction(isCorrective || false);
        
        // Only update onboarding_status if lifecycle_status is 'onboarding' (or profile doesn't exist - new user)
        if (!profile || profile.lifecycle_status === 'onboarding') {
          // First ensure the row exists, then set the step
          getOrCreateOnboarding(user.id)
            .then(() => setLastStep(user.id, 'photos'))
            .catch((error) => {
              console.error('[PhotosScreen] Failed to set current step:', error);
            });
        } else {
          console.log(
            `[PhotosScreen] Skipping onboarding_status update - lifecycle_status is '${status}', not 'onboarding'`
          );
        }
      } catch (error) {
        console.error('[PhotosScreen] Failed to check profile status:', error);
      }
    };

    checkProfileStatus();
  }, [user?.id]);

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

  // Save pending reorders when user leaves this screen
  useFocusEffect(
    React.useCallback(() => {
      return () => {
        // On blur (user leaving screen) - save pending reorders
        savePendingReordersIfNeeded().catch((err: unknown) => {
          console.warn('[PhotosScreen] Failed to save pending reorders on screen switch:', err);
        });
      };
    }, [savePendingReordersIfNeeded])
  );

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
    
    // Mark photos as submitted and advance to preferences step (only during onboarding)
    markSubmitted(user.id, 'photos').catch((error) => {
      console.error('[PhotosScreen] Failed to mark photos as submitted:', error);
      // Don't block navigation on error
    });
    
    router.push('/(profile)/connection-style');
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user?.id) return;

    try {
      // For corrective action (not onboarding), trigger validation again
      if (isCorrectiveAction) {
        // Start new validation process
        const validationRunId = await startValidation(user.id);
        
        // Trigger profile validation edge function
        try {
          const { supabase } = await import('@/services/supabase/supabaseClient');
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session?.access_token) {
            const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
            if (supabaseUrl) {
              const response = await fetch(`${supabaseUrl}/functions/v1/validate-profile`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  user_id: user.id,
                  validation_run_id: validationRunId,
                }),
              });

              if (!response.ok) {
                console.error('[PhotosScreen] Validation job failed:', await response.text());
              } else {
                console.log('[PhotosScreen] Validation job completed:', await response.json());
              }
            }
          }
        } catch (error) {
          console.error('[PhotosScreen] Failed to trigger validation job:', error);
        }
      } else {
        // During onboarding, mark as submitted (though this shouldn't happen if isCorrectiveAction logic is correct)
        markSubmitted(user.id, 'photos').catch((error) => {
          console.error('[PhotosScreen] Failed to mark photos as submitted:', error);
        });
      }

      // Navigate to feed page
      router.replace('/(tabs)');
    } catch (error) {
      console.error('[PhotosScreen] Failed to submit photos:', error);
    }
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

