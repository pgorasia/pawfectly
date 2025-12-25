/**
 * Photos Upload Page
 * Allows users to upload photos for their dogs and themselves
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { ProgressBar } from '@/components/common/ProgressBar';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { DogPhotoBucket } from '@/components/dog/DogPhotoBucket';
import { HumanPhotoBucket } from '@/components/human/HumanPhotoBucket';
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { usePhotoBuckets } from '@/hooks/usePhotoBuckets';
import { Spacing } from '@/constants/spacing';

export default function PhotosScreen() {
  const router = useRouter();
  const { draft } = useProfileDraft();

  // Use simple string IDs: 'dog1', 'dog2', 'dog3' based on index
  // Human photos will use 'NA'
  const dogIds = useMemo(() => {
    return draft.dogs.map((_, index) => `dog${index + 1}`);
  }, [draft.dogs]);

  const {
    dogBuckets,
    humanBucket,
    uploadPhotoToBucket,
    removePhoto,
    replacePhoto,
    hasHumanDogPhoto,
  } = usePhotoBuckets(dogIds);

  // Check if continue button should be enabled
  // Enabled only if each bucket has at least one photo (even if validation is in progress)
  // AND no rejected photos exist
  const canContinue = useMemo(() => {
    // Check if all dog buckets have at least one photo
    const allDogsHavePhotos = dogIds.every((dogId) => {
      const bucket = dogBuckets[dogId];
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
  }, [dogBuckets, humanBucket, dogIds]);

  const handleContinue = () => {
    if (!canContinue) return;
    router.push('/(profile)/connection-style');
  };

  return (
    <ScreenContainer>
      <ProgressBar
        currentStep={2}
        totalSteps={3}
        stepTitles={['My Pack', 'Photos', 'Preferences']}
      />
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

        {/* Dog Photos */}
        {draft.dogs.map((dog, index) => {
          const dogId = `dog${index + 1}`;
          const bucket = dogBuckets[dogId];
          if (!bucket) return null;

          return (
            <DogPhotoBucket
              key={dogId}
              dogName={dog.name || 'Unnamed Dog'}
              dogId={dogId}
              bucket={bucket}
              onUpload={() => uploadPhotoToBucket('dog', dogId)}
              onRemove={(photoId) => removePhoto(photoId, 'dog', dogId)}
              onReplace={(photoId) => replacePhoto(photoId, 'dog', dogId)}
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

