import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useMe } from '@/contexts/MeContext';
import { checkSelfieVerificationLimits } from '@/services/badges/badgeService';
import { getLatestSelfieVerificationRequest, type SelfieVerificationRequest } from '@/services/badges/selfieVerificationService';
import { MaterialIcons } from '@expo/vector-icons';

export default function SelfieIntroScreen() {
  const router = useRouter();
  const { me, meLoaded } = useMe();

  const [limitsLoading, setLimitsLoading] = useState(true);
  const [limitsError, setLimitsError] = useState<string | null>(null);

  const [latestRequest, setLatestRequest] = useState<SelfieVerificationRequest | null>(null);
  const [requestLoading, setRequestLoading] = useState(true);

  const isSelfieVerified = useMemo(() => {
    const badge = (me?.badges || []).find((b: any) => b.type === 'selfie_verified');
    return Boolean(badge?.earned);
  }, [me?.badges]);

  const isPending = latestRequest?.status === 'pending';
  const isRejected = latestRequest?.status === 'rejected';

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLimitsLoading(true);
        setLimitsError(null);

        // Limits are enforced server-side too, but we fetch them early to avoid
        // sending the user through the flow only to block them at the end.
        await checkSelfieVerificationLimits();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (mounted) setLimitsError(message);
      } finally {
        if (mounted) setLimitsLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadRequest() {
      if (!meLoaded) return;

      try {
        setRequestLoading(true);
        const req = await getLatestSelfieVerificationRequest();
        if (mounted) setLatestRequest(req);
      } finally {
        if (mounted) setRequestLoading(false);
      }
    }

    loadRequest();

    return () => {
      mounted = false;
    };
  }, [meLoaded]);

  const handleContinue = () => {
    if (isSelfieVerified) {
      router.replace('/(tabs)/account?tab=badges');
      return;
    }
    if (isPending) {
      router.replace('/(tabs)/account?tab=badges');
      return;
    }
    router.push('/(selfie)/photo-selection');
  };

  const statusRow = (() => {
    if (requestLoading || !meLoaded) {
      return (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <AppText variant="caption" style={styles.statusText}>
            Checking verification status…
          </AppText>
        </View>
      );
    }

    if (isSelfieVerified) {
      return (
        <View style={styles.statusRow}>
          <MaterialIcons name="verified" size={18} color={Colors.primary} />
          <AppText variant="caption" style={styles.statusText}>
            Verified
          </AppText>
        </View>
      );
    }

    if (isPending) {
      return (
        <View style={styles.statusRow}>
          <MaterialIcons name="schedule" size={18} color={Colors.text} />
          <AppText variant="caption" style={styles.statusText}>
            Under review
          </AppText>
        </View>
      );
    }

    if (isRejected) {
      return (
        <View style={styles.statusRow}>
          <MaterialIcons name="error-outline" size={18} color={'#ef4444'} />
          <AppText variant="caption" style={styles.statusText}>
            Previous attempt was rejected. You can try again.
          </AppText>
        </View>
      );
    }

    return (
      <View style={styles.statusRow}>
        <MaterialIcons name="info-outline" size={18} color={Colors.text} />
        <AppText variant="caption" style={styles.statusText}>
          Not verified yet
        </AppText>
      </View>
    );
  })();

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <AppText variant="heading" style={styles.title}>
          Selfie Verification
        </AppText>

        <AppText variant="body" style={styles.subtitle}>
          To keep Pawfectly safe and dog-approved, we verify that you’re a real person and that your profile photos match you.
        </AppText>

        {statusRow}

        <View style={styles.card}>
          <View style={styles.cardRow}>
            <MaterialIcons name="photo-camera" size={18} color={Colors.primary} />
            <AppText variant="body" style={styles.cardText}>
              You’ll take a quick selfie.
            </AppText>
          </View>

          <View style={styles.cardRow}>
            <MaterialIcons name="image" size={18} color={Colors.primary} />
            <AppText variant="body" style={styles.cardText}>
              We’ll compare it to one of your profile photos.
            </AppText>
          </View>

          <View style={styles.cardRow}>
            <MaterialIcons name="lock-outline" size={18} color={Colors.primary} />
            <AppText variant="body" style={styles.cardText}>
              Your selfie is stored securely for verification and can be deleted as part of routine cleanup after review.
            </AppText>
          </View>
        </View>

        {!!limitsError && (
          <View style={styles.errorBox}>
            <AppText variant="caption" style={styles.errorText}>
              {limitsError}
            </AppText>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.primaryButton,
            (limitsLoading || isPending) && styles.primaryButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={limitsLoading || isPending}
          activeOpacity={0.8}
        >
          {limitsLoading ? (
            <ActivityIndicator size="small" color={Colors.background} />
          ) : (
            <AppText variant="body" style={styles.primaryButtonText}>
              {isSelfieVerified ? 'Back to My Badges' : isPending ? 'Under Review' : 'Continue'}
            </AppText>
          )}
        </TouchableOpacity>

        {!isPending && !isSelfieVerified && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/(tabs)/account?tab=badges')}
            activeOpacity={0.8}
          >
            <AppText variant="caption" style={styles.secondaryButtonText}>
              Not now
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    opacity: 0.8,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statusText: {
    opacity: 0.8,
  },
  card: {
    backgroundColor: 'rgba(31, 41, 55, 0.04)',
    borderRadius: 16,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  cardText: {
    flex: 1,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: '#ef4444',
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: Colors.background,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: Spacing.md,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.text,
    opacity: 0.6,
  },
});
