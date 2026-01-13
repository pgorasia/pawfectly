import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { MaterialIcons } from '@expo/vector-icons';

export default function SelfieResultScreen() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();

  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isPending = !status || status === 'pending';

  const icon = isApproved ? 'verified' : isRejected ? 'error-outline' : 'schedule';
  const iconColor = isApproved ? Colors.primary : isRejected ? '#ef4444' : Colors.text;

  const title = isApproved
    ? 'Verified'
    : isRejected
      ? 'Not verified'
      : 'Submitted for review';

  const subtitle = isApproved
    ? 'You’re verified. Your profile will be shown more prominently.'
    : isRejected
      ? 'We couldn’t verify your selfie this time. You can try again from My Badges.'
      : 'Your selfie was submitted successfully. We’ll review it and update your badge once approved.';

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <MaterialIcons name={icon as any} size={42} color={iconColor} />
        </View>

        <AppText variant="heading" style={styles.title}>
          {title}
        </AppText>

        <AppText variant="body" style={styles.subtitle}>
          {subtitle}
        </AppText>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.replace('/(tabs)/account?tab=badges')}
          activeOpacity={0.85}
        >
          <AppText variant="body" style={styles.primaryButtonText}>
            Back to My Badges
          </AppText>
        </TouchableOpacity>

        {isPending && (
          <AppText variant="caption" style={styles.caption}>
            Note: Reviews may take some time. You can continue using Pawfectly in the meantime.
          </AppText>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    opacity: 0.8,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: Colors.background,
    fontWeight: '700',
  },
  caption: {
    marginTop: Spacing.lg,
    opacity: 0.55,
    textAlign: 'center',
    lineHeight: 18,
  },
});
