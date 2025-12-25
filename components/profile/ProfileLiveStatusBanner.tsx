/**
 * Profile Live Status Banner
 * Shows notification about profile live status
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useUserLiveStatus } from '@/hooks/useUserLiveStatus';

export const ProfileLiveStatusBanner: React.FC = () => {
  const router = useRouter();
  const { isLive, isLoading } = useUserLiveStatus();

  // Don't show anything while loading
  if (isLoading || isLive === null) {
    return null;
  }

  // Show success banner if live
  if (isLive) {
    return (
      <View style={styles.successBanner}>
        <AppText variant="caption" style={styles.successText}>
          ✅ Your profile is approved and live
        </AppText>
      </View>
    );
  }

  // Show error banner if not live
  return (
    <TouchableOpacity
      style={styles.errorBanner}
      onPress={() => router.push('/(profile)/dogs')}
      activeOpacity={0.8}
    >
      <AppText variant="caption" style={styles.errorText}>
        ⚠️ One or more of your photos failed verification. Please fix your photos to go live.
      </AppText>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  successBanner: {
    backgroundColor: Colors.primary + '20',
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  successText: {
    color: Colors.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: Colors.accent + '20',
    padding: Spacing.md,
    borderRadius: 8,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  errorText: {
    color: Colors.accent,
    textAlign: 'center',
    fontWeight: '600',
  },
});

