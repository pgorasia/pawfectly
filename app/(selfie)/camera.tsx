import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { submitSelfieVerificationRequest } from '@/services/badges/selfieVerificationService';
import { MaterialIcons } from '@expo/vector-icons';

export default function SelfieCameraScreen() {
  const router = useRouter();
  const { photoId } = useLocalSearchParams<{ photoId: string }>();

  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieDims, setSelfieDims] = useState<{ width?: number; height?: number }>({});
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => Boolean(photoId) && Boolean(selfieUri) && !submitting, [photoId, selfieUri, submitting]);

  const captureSelfie = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to take a selfie.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
        exif: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Alert.alert('Error', 'Unable to read the captured image. Please try again.');
        return;
      }

      setSelfieUri(asset.uri);
      setSelfieDims({ width: asset.width, height: asset.height });
    } catch (e) {
      console.error('[SelfieCamera] capture error:', e);
      Alert.alert('Error', 'Failed to open camera. Please try again.');
    }
  };

  const handleSubmit = async () => {
    if (!photoId || !selfieUri) {
      Alert.alert('Missing info', 'Please select a reference photo and take a selfie.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await submitSelfieVerificationRequest({
        referencePhotoId: photoId,
        selfieUri,
        selfieWidth: selfieDims.width,
        selfieHeight: selfieDims.height,
        metadata: {
          client: 'pawfectly_mobile',
          flow: 'selfie_verification_phase1',
        },
      });

      if (!res.ok) {
        Alert.alert('Unable to submit', res.error);
        return;
      }

      router.replace({
        pathname: '/(selfie)/result',
        params: {
          status: res.status,
        },
      });
    } catch (e) {
      console.error('[SelfieCamera] submit error:', e);
      Alert.alert('Error', 'Something went wrong while submitting. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <AppText variant="heading" style={styles.title}>
          Take a selfie
        </AppText>

        <AppText variant="body" style={styles.subtitle}>
          Make sure your face is clearly visible. Avoid hats and heavy filters.
        </AppText>

        {selfieUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: selfieUri }} style={styles.preview} />
            <View style={styles.previewBadge}>
              <MaterialIcons name="check-circle" size={16} color={Colors.primary} />
              <AppText variant="caption" style={styles.previewBadgeText}>
                Ready to submit
              </AppText>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.captureCard} onPress={captureSelfie} activeOpacity={0.85}>
            <View style={styles.captureIcon}>
              <MaterialIcons name="photo-camera" size={26} color={Colors.primary} />
            </View>
            <AppText variant="body" style={styles.captureTitle}>
              Open Camera
            </AppText>
            <AppText variant="caption" style={styles.captureSubtitle}>
              Take a quick selfie for verification
            </AppText>
          </TouchableOpacity>
        )}

        <View style={styles.actions}>
          {selfieUri && (
            <TouchableOpacity
              style={[styles.secondaryButton, submitting && styles.buttonDisabled]}
              onPress={captureSelfie}
              disabled={submitting}
              activeOpacity={0.85}
            >
              <AppText variant="body" style={styles.secondaryButtonText}>
                Retake
              </AppText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.primaryButton, (!canSubmit || submitting) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <AppText variant="body" style={styles.primaryButtonText}>
                Submit
              </AppText>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    opacity: 0.75,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  captureCard: {
    flex: 1,
    minHeight: 220,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.12)',
    backgroundColor: 'rgba(31, 41, 55, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  captureIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  captureTitle: {
    fontWeight: '700',
  },
  captureSubtitle: {
    opacity: 0.6,
    textAlign: 'center',
  },
  previewWrap: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.12)',
    backgroundColor: 'rgba(31, 41, 55, 0.03)',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  previewBadge: {
    position: 'absolute',
    left: Spacing.md,
    bottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.background,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.08)',
  },
  previewBadgeText: {
    opacity: 0.8,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.background,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
