/**
 * Selfie Verification Flow
 * Multi-step flow: Intro → Photo Selection → Camera → Result
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMe } from '@/contexts/MeContext';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Image } from 'expo-image';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { getEligibleHumanPhotos, canAttemptSelfieVerification, checkSelfieVerificationLimits, completeSelfieVerification } from '@/services/badges/badgeService';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/services/supabase/supabaseClient';
import type { Photo } from '@/types/photo';

type VerificationStep = 'intro' | 'photo-selection' | 'camera' | 'result';

export default function SelfieVerificationScreen() {
  const router = useRouter();
  const { refreshBadges } = useMe();
  const [step, setStep] = useState<VerificationStep>('intro');
  const [eligiblePhotos, setEligiblePhotos] = useState<Photo[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(false);
  const [attemptResult, setAttemptResult] = useState<{ allowed: boolean; remaining_hourly: number; remaining_daily: number; retry_after_seconds: number | null } | null>(null);
  const [verificationResult, setVerificationResult] = useState<'success' | 'failure' | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  useEffect(() => {
    if (step === 'intro') {
      loadAttemptInfo();
    }
  }, [step]);

  useEffect(() => {
    if (step === 'photo-selection') {
      loadEligiblePhotos();
    }
  }, [step]);

  const loadAttemptInfo = async () => {
    try {
      const result = await checkSelfieVerificationLimits();
      setAttemptResult(result);
    } catch (error) {
      console.error('[SelfieVerification] Failed to load attempt info:', error);
      // Don't show error - just proceed
    }
  };

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
              onPress: () => router.push('/(tabs)/account?tab=photos'),
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error) {
      console.error('[SelfieVerification] Failed to load photos:', error);
      Alert.alert('Error', 'Failed to load photos. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    // Check if user can proceed (show warning if at limit, but allow to see current status)
    if (attemptResult && !attemptResult.allowed) {
      if (attemptResult.retry_after_seconds) {
        Alert.alert(
          'Please Wait',
          `You can try again in ${attemptResult.retry_after_seconds} seconds.`,
          [{ text: 'OK' }]
        );
        return;
      } else {
        Alert.alert(
          'Rate Limit Reached',
          `You've reached your verification attempt limit. You have ${attemptResult.remaining_hourly} attempts remaining this hour and ${attemptResult.remaining_daily} remaining today.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }
    
    setStep('photo-selection');
  };

  const handlePhotoSelect = (photo: Photo) => {
    setSelectedPhoto(photo);
    setStep('camera');
  };

  const handleCameraCapture = async (selfieUri: string) => {
    if (!selectedPhoto) return;

    try {
      setLoading(true);
      
      // Check and increment attempt limit BEFORE processing
      const attemptCheck = await canAttemptSelfieVerification();
      setAttemptResult(attemptCheck);
      
      if (!attemptCheck.allowed) {
        if (attemptCheck.retry_after_seconds) {
          Alert.alert(
            'Please Wait',
            `You can try again in ${attemptCheck.retry_after_seconds} seconds.`,
            [{ text: 'OK' }]
          );
          setStep('intro');
          return;
        } else {
          Alert.alert(
            'Rate Limit Reached',
            `You've reached your verification attempt limit. You have ${attemptCheck.remaining_hourly} attempts remaining this hour and ${attemptCheck.remaining_daily} remaining today.`,
            [{ text: 'OK' }]
          );
          setStep('intro');
          return;
        }
      }
      
      // TODO: Implement on-device face matching
      // For now, this is a placeholder
      // In production, this would:
      // 1. Detect face in selfie
      // 2. Extract face embedding from selfie
      // 3. Extract face embedding from selected photo
      // 4. Compare embeddings (cosine similarity)
      // 5. Return match result
      
      // Placeholder: Simulate verification (replace with actual face matching)
      const matchResult = await simulateFaceMatching(selfieUri, selectedPhoto);
      
      if (matchResult.success) {
        await completeSelfieVerification(selectedPhoto.id);
        // Refresh cached badge statuses so Account → My Badges updates immediately
        refreshBadges().catch((error) => {
          console.error('[SelfieVerification] Failed to refresh badges:', error);
        });
        setVerificationResult('success');
      } else {
        setVerificationResult('failure');
        setFailureReason(matchResult.reason || 'Face verification failed. Please try again.');
      }
      
      setStep('result');
    } catch (error) {
      console.error('[SelfieVerification] Verification failed:', error);
      setVerificationResult('failure');
      setFailureReason('An error occurred during verification. Please try again.');
      setStep('result');
    } finally {
      setLoading(false);
    }
  };

  const simulateFaceMatching = async (selfieUri: string, referencePhoto: Photo): Promise<{ success: boolean; reason?: string }> => {
    // TODO: Replace with actual face matching implementation
    // This is a placeholder that always fails for now
    return {
      success: false,
      reason: 'Face matching not yet implemented. This is a placeholder.',
    };
  };

  const handleRetry = () => {
    setVerificationResult(null);
    setFailureReason(null);
    setSelectedPhoto(null);
    setStep('intro');
  };

  const handleDone = () => {
    router.back();
  };

  // Render intro screen
  if (step === 'intro') {
    return (
      <ScreenContainer>
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.introContent}>
            <IconSymbol name="camera.fill" size={64} color={Colors.primary} style={styles.introIcon} />
            <AppText variant="heading" style={styles.introTitle}>
              Verify Your Selfie
            </AppText>
            <AppText variant="body" style={styles.introText}>
              We'll compare a selfie to your profile photos. We don't store your selfie.
            </AppText>
            {attemptResult && (
              <View style={styles.attemptInfo}>
                <AppText variant="caption" style={styles.attemptInfoText}>
                  {attemptResult.remaining_hourly} attempts remaining this hour
                </AppText>
                <AppText variant="caption" style={styles.attemptInfoText}>
                  {attemptResult.remaining_daily} attempts remaining today
                </AppText>
              </View>
            )}
          </View>
          <AppButton
            variant="primary"
            onPress={handleStart}
            style={styles.startButton}
          >
            Start
          </AppButton>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Render photo selection screen
  if (step === 'photo-selection') {
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
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => setStep('intro')} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={Colors.text} />
          </TouchableOpacity>
          <AppText variant="heading" style={styles.topHeaderTitle}>
            Pick the photo you want to verify
          </AppText>
        </View>
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

  // Render camera screen
  if (step === 'camera') {
    return (
      <ScreenContainer>
        <View style={styles.cameraContainer}>
          <View style={styles.cameraHeader}>
            <TouchableOpacity onPress={() => setStep('photo-selection')} style={styles.backButtonCamera}>
              <IconSymbol name="chevron.left" size={24} color={Colors.background} />
            </TouchableOpacity>
            <AppText variant="heading" style={styles.cameraHeaderTitle}>
              Center your face
            </AppText>
            <View style={styles.headerSpacer} />
          </View>
          
          {/* TODO: Replace with actual VisionCamera component */}
          <View style={styles.cameraPlaceholder}>
            <AppText variant="body" style={styles.cameraPlaceholderText}>
              Camera view will be implemented with VisionCamera
            </AppText>
            <AppText variant="caption" style={styles.cameraPlaceholderSubtext}>
              Face detection and matching will happen here
            </AppText>
          </View>
          
          <View style={styles.cameraFooter}>
            <AppText variant="body" style={styles.cameraInstructions}>
              Good lighting • Face centered
            </AppText>
            <AppButton
              variant="primary"
              onPress={async () => {
                try {
                  // Check if camera permissions are already granted
                  let { status } = await ImagePicker.getCameraPermissionsAsync();
                  
                  // Only request if not already granted
                  if (status !== 'granted') {
                    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
                    status = permissionResult.status;
                    
                    if (status !== 'granted') {
                      Alert.alert(
                        'Camera Permission Required',
                        'Please grant camera permission to take a selfie.',
                        [{ text: 'OK' }]
                      );
                      return;
                    }
                  }

                  // Launch camera in selfie mode (front camera)
                  const result = await ImagePicker.launchCameraAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    aspect: [1, 1],
                    quality: 0.8,
                    cameraType: ImagePicker.CameraType.front, // Selfie mode - front camera
                  });

                  if (!result.canceled && result.assets[0]) {
                    await handleCameraCapture(result.assets[0].uri);
                  }
                } catch (error) {
                  console.error('[SelfieVerification] Failed to capture image:', error);
                  Alert.alert('Error', 'Failed to capture image. Please try again.');
                }
              }}
              style={styles.captureButton}
            >
              Capture
            </AppButton>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // Render result screen
  if (step === 'result') {
    const isSuccess = verificationResult === 'success';
    
    return (
      <ScreenContainer>
        <View style={styles.topHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.resultContainer}>
          <IconSymbol
            name={isSuccess ? "checkmark.circle.fill" : "xmark.circle.fill"}
            size={80}
            color={isSuccess ? Colors.primary : '#EF4444'}
            style={styles.resultIcon}
          />
          <AppText variant="heading" style={styles.resultTitle}>
            {isSuccess ? 'Verification Complete!' : 'Verification Failed'}
          </AppText>
          {failureReason && (
            <AppText variant="body" style={styles.resultText}>
              {failureReason}
            </AppText>
          )}
          
          <View style={styles.resultButtons}>
            {isSuccess ? (
              <AppButton
                variant="primary"
                onPress={handleDone}
                style={styles.resultButton}
              >
                Done
              </AppButton>
            ) : (
              <>
                <AppButton
                  variant="secondary"
                  onPress={handleRetry}
                  style={[styles.resultButton, styles.resultButtonSecondary]}
                >
                  Try Again
                </AppButton>
                <AppButton
                  variant="primary"
                  onPress={handleDone}
                  style={styles.resultButton}
                >
                  Cancel
                </AppButton>
              </>
            )}
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return null;
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
  introContent: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  introIcon: {
    marginBottom: Spacing.lg,
  },
  introTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  introText: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  attemptInfo: {
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  attemptInfoText: {
    textAlign: 'center',
    opacity: 0.6,
  },
  startButton: {
    marginTop: Spacing.xl,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  backButton: {
    padding: Spacing.sm,
    marginLeft: -Spacing.sm,
    marginRight: Spacing.md,
  },
  backButtonCamera: {
    padding: Spacing.sm,
    marginRight: Spacing.md,
  },
  topHeaderTitle: {
    flex: 1,
  },
  headerSpacer: {
    flex: 1,
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
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    width: '100%',
  },
  cameraHeaderTitle: {
    color: Colors.background,
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  cameraPlaceholderText: {
    color: Colors.background,
    marginBottom: Spacing.sm,
  },
  cameraPlaceholderSubtext: {
    color: Colors.background,
    opacity: 0.6,
  },
  cameraFooter: {
    padding: Spacing.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  cameraInstructions: {
    color: Colors.background,
    textAlign: 'center',
    marginBottom: Spacing.md,
    opacity: 0.8,
  },
  captureButton: {
    marginTop: Spacing.sm,
  },
  resultContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  resultIcon: {
    marginBottom: Spacing.lg,
  },
  resultTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  resultText: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  resultButtons: {
    width: '100%',
    gap: Spacing.md,
  },
  resultButton: {
    width: '100%',
  },
  resultButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
});
