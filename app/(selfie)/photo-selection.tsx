import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, BackHandler, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Image } from 'expo-image';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { getEligibleHumanPhotos } from '@/services/badges/badgeService';
import { supabase } from '@/services/supabase/supabaseClient';
import type { Photo } from '@/types/photo';

export default function PhotoSelectionScreen() {
  const router = useRouter();
  const [eligiblePhotos, setEligiblePhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEligiblePhotos();
  }, []);

  // Handle Android hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.replace('/(selfie)/intro');
        return true;
      };

      if (Platform.OS === 'android') {
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
      }
    }, [router])
  );

  const loadEligiblePhotos = async () => {
    try {
      setLoading(true);
      const photos = await getEligibleHumanPhotos();
      setEligiblePhotos(photos);
      
      if (photos.length === 0) {
        Alert.alert(
          'No Eligible Photos',
          'You need at least one approved photo with a human to verify your selfie.',
          [
            {
              text: 'Go to Photos',
              onPress: () => router.replace('/(tabs)/account?tab=photos'),
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => router.replace('/(selfie)/intro'),
            },
          ]
        );
      }
    } catch (error) {
      console.error('[PhotoSelection] Failed to load photos:', error);
      Alert.alert('Error', 'Failed to load photos. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoSelect = (photo: Photo) => {
    router.replace({
      pathname: '/(selfie)/camera',
      params: { photoId: photo.id },
    });
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <AppText variant="body" style={styles.loadingText}>
            Loading photos...
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.photoGrid}>
          {eligiblePhotos.map((photo) => {
            const { data } = supabase.storage
              .from('photos')
              .getPublicUrl(photo.storage_path);
            
            return (
              <TouchableOpacity
                key={photo.id}
                style={styles.photoItem}
                onPress={() => handlePhotoSelect(photo)}
              >
                <Image
                  source={{ uri: data?.publicUrl || '' }}
                  style={styles.photoThumbnail}
                  contentFit="cover"
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    opacity: 0.7,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  photoItem: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
  },
});
