/**
 * Dog Photo Bucket Component
 * Displays photo grid for a single dog with upload functionality
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import type { Photo } from '@/types/photo';
import type { PhotoBucketState } from '@/hooks/usePhotoBuckets';
import { supabase } from '@/services/supabase/supabaseClient';
import Ionicons from '@expo/vector-icons/Ionicons';

interface DogPhotoBucketProps {
  dogName: string;
  dogId: string;
  bucket: PhotoBucketState;
  onUpload: () => Promise<void>;
  onRemove: (photoId: string) => Promise<void>;
  onReplace?: (photoId: string) => Promise<void>;
}

const MAX_PHOTOS = 3;

export const DogPhotoBucket: React.FC<DogPhotoBucketProps> = ({
  dogName,
  dogId,
  bucket,
  onUpload,
  onRemove,
  onReplace,
}) => {
  const { photos, isUploading, uploadError } = bucket;
  const canAddMore = photos.length < MAX_PHOTOS;

  const handleRemove = (photoId: string, e: any) => {
    e.stopPropagation();
    onRemove(photoId);
  };

  const handlePhotoPress = (photoId: string) => {
    if (onReplace) {
      onReplace(photoId);
    } else {
      onUpload();
    }
  };


  const getRejectionMessage = (reason: string | null | undefined): string => {
    if (!reason) return 'Rejected';
    
    // Map rejection reasons to user-friendly messages
    if (reason === 'nsfw_or_disallowed' || reason.includes('NSFW') || reason.includes('inappropriate')) {
      return 'Inappropriate photo';
    }
    if (reason === 'missing_dog' || reason.includes('no dog') || reason.includes('dog is missing')) {
      return 'No dog found';
    }
    if (reason === 'missing_human' || reason.includes('no human') || reason.includes('human is missing')) {
      return 'No person found';
    }
    if (reason === 'contains_contact_info' || reason.includes('contact') || reason.includes('phone') || reason.includes('email') || reason.includes('Instagram')) {
      return 'Info not allowed';
    }
    if (reason === 'is_screenshot' || reason.includes('screenshot') || reason.includes('UI capture') || reason.includes('screen capture')) {
      return 'Screenshot not allowed';
    }
    
    return 'Rejected';
  };

  // Memoize photo URLs to avoid recalculating on every render
  const photoUrls = useMemo(() => {
    const urlMap = new Map<string, string | null>();
    photos.forEach((photo) => {
      const { data } = supabase.storage
        .from('photos')
        .getPublicUrl(photo.storage_path);
      urlMap.set(photo.id, data?.publicUrl || null);
    });
    return urlMap;
  }, [photos]);

  return (
    <Card style={styles.container}>
      <View style={styles.header}>
        <AppText variant="body" style={styles.title}>
          {dogName}'s Photos
        </AppText>
        <AppText variant="caption" style={styles.count}>
          {photos.length} / {MAX_PHOTOS} uploaded
        </AppText>
      </View>

      {uploadError && (
        <View style={styles.errorContainer}>
          <AppText variant="caption" color={Colors.accent} style={styles.errorText}>
            {uploadError}
          </AppText>
        </View>
      )}

      <View style={styles.photoGrid}>
        {photos.map((photo, index) => {
          const imageUrl = photoUrls.get(photo.id) ?? null;
          const isRejected = photo.status === 'rejected';
          return (
            <View key={photo.id} style={styles.photoTileContainer}>
              <View
                style={[
                  styles.photoTile,
                  isRejected && styles.photoTileRejected,
                ]}
              >
                {imageUrl ? (
                  <TouchableOpacity
                    onPress={() => handlePhotoPress(photo.id)}
                    activeOpacity={0.9}
                    style={styles.photoTouchable}
                  >
                    <Image 
                      source={{ uri: imageUrl }} 
                      style={styles.photo}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <AppText variant="caption">Loading...</AppText>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={(e) => handleRemove(photo.id, e)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash" size={18} color={Colors.background} />
                </TouchableOpacity>
                {photo.contains_dog && photo.contains_human && !isRejected && (
                  <>
                    <View style={styles.badge}>
                      <AppText variant="caption" style={styles.badgeText}>
                        🏆
                      </AppText>
                    </View>
                    <View style={styles.classificationLabel}>
                      <AppText variant="caption" style={styles.classificationText}>
                        Counts for both ✅
                      </AppText>
                    </View>
                  </>
                )}
              </View>
              {isRejected && (
                <View style={styles.rejectionReasonContainer}>
                  <AppText variant="caption" style={styles.rejectionReasonText}>
                    {getRejectionMessage(photo.rejection_reason)}
                  </AppText>
                </View>
              )}
            </View>
          );
        })}

        {isUploading && (
          <View style={styles.photoTile}>
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <AppText variant="caption" style={styles.uploadingText}>
                Validating...
              </AppText>
            </View>
          </View>
        )}

        {canAddMore && !isUploading && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={onUpload}
            disabled={isUploading}
          >
            <AppText variant="body" style={styles.addButtonText}>
              +
            </AppText>
            <AppText variant="caption" style={styles.addButtonLabel}>
              Add Photo
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontWeight: '600',
  },
  count: {
    opacity: 0.6,
  },
  errorContainer: {
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.accent + '20',
    borderRadius: 4,
  },
  errorText: {
    textAlign: 'center',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  photoTileContainer: {
    width: '30%',
    marginBottom: Spacing.xs,
  },
  photoTile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  photoTileRejected: {
    borderWidth: 2,
    borderColor: Colors.error,
  },
  photoTouchable: {
    width: '100%',
    height: '100%',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.text + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
  },
  classificationLabel: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: Colors.secondary + 'E0',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  classificationText: {
    color: Colors.background,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  uploadingContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.text + '10',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  uploadingText: {
    opacity: 0.6,
  },
  addButton: {
    width: '30%',
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: Colors.text,
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  addButtonText: {
    fontSize: 32,
    fontWeight: '300',
    marginBottom: Spacing.xs,
  },
  addButtonLabel: {
    opacity: 0.6,
  },
  rejectionReasonContainer: {
    marginTop: Spacing.xs,
    padding: Spacing.xs,
    backgroundColor: Colors.error + '20',
    borderRadius: 4,
  },
  rejectionReasonText: {
    color: Colors.error,
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '500',
  },
});

