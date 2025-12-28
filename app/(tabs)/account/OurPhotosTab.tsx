/**
 * Our Photos Tab - Replica of Photos onboarding page for editing
 * All changes are autosaved
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { DogPhotoBucket } from '@/components/dog/DogPhotoBucket';
import { HumanPhotoBucket } from '@/components/human/HumanPhotoBucket';
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { usePhotoBuckets } from '@/hooks/usePhotoBuckets';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

export default function OurPhotosTab() {
  const { draft } = useProfileDraft();

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

