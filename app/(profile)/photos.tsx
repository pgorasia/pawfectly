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
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { usePhotoBuckets } from '@/hooks/usePhotoBuckets';
import { useAuth } from '@/contexts/AuthContext';
import { setCurrentStep } from '@/services/supabase/onboardingService';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

export default function PhotosScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { draft } = useProfileDraft();

  // Set current step when page loads
  React.useEffect(() => {
    if (user?.id) {
      setCurrentStep(user.id, 'photos').catch((error) => {
        console.error('[PhotosScreen] Failed to set current step:', error);
      });
    }
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
  } = usePhotoBuckets(dogSlots);

  // Check if continue button should be enabled
  // Enabled only if each bucket has at least one photo (even if validation is in progress)
  // AND no rejected photos exist
  const canContinue = useMemo(() => {
    // Check if all dog buckets have at least one photo
    const allDogsHavePhotos = dogSlots.every((slot) => {
      const bucket = dogBuckets[slot];
      return bucket && bucket.photos.length > 0;
    });

    // Check if human bucket has at least one photo
    const humanHasPhotos = humanBucket.photos.length > 0;

    // Check if any photo is rejected
    const hasRejectedPhotos = 
      Object.values(dogBuckets).some((bucket) =>
        bucket.photos.some((photo) => photo.status === 'rejected')
      ) || humanBucket.photos.some((photo) => photo.status === 'rejected');

    return allDogsHavePhotos && humanHasPhotos && !hasRejectedPhotos;
  }, [dogBuckets, humanBucket, dogSlots]);

  const handleContinue = () => {
    if (!canContinue) return;
    router.push('/(profile)/connection-style');
  };

  return (
    <ScreenContainer>
      <ProgressBar
        currentStep={3}
        totalSteps={4}
        stepTitles={['Your Pack', 'Little about you', 'Photos', 'Preferences']}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              onPress={() => router.push('/(profile)/human')}
              style={styles.backButton}
            >
              <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
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
              onUpload={() => uploadPhotoToBucket('dog', dog.slot)}
              onRemove={(photoId) => removePhoto(photoId, 'dog', dog.slot)}
              onReplace={(photoId) => replacePhoto(photoId, 'dog', dog.slot)}
            />
          );
        })}

        {/* Human Photos */}
        <HumanPhotoBucket
          bucket={humanBucket}
          onUpload={() => uploadPhotoToBucket('human')}
          onRemove={(photoId) => removePhoto(photoId, 'human')}
          onReplace={(photoId) => replacePhoto(photoId, 'human')}
          hasHumanDogPhoto={hasHumanDogPhoto}
        />

        <View style={styles.buttonContainer}>
          <AppButton 
            variant="primary" 
            onPress={handleContinue} 
            style={styles.button}
            disabled={!canContinue}
          >
            Continue
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

