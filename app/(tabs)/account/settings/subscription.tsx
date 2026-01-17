import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useMySubscription } from '@/hooks/useMySubscription';
import { useMyEntitlements } from '@/hooks/useMyEntitlements';
import { isEntitlementActive } from '@/services/entitlements/entitlementsService';
import { cancelMySubscription } from '@/services/billing/subscriptionService';

export default function SubscriptionScreen() {
  const router = useRouter();
  const { data: subscription, loading: loadingSubscription, refresh: refreshSubscription } = useMySubscription();
  const { data: entitlements, loading: loadingEntitlements, refresh: refreshEntitlements } = useMyEntitlements();
  const [cancelling, setCancelling] = useState(false);

  const isPlus = isEntitlementActive(entitlements, 'plus');

  const periodEndLabel = useMemo(() => {
    if (!subscription?.current_period_end) return null;
    const ts = new Date(subscription.current_period_end).getTime();
    if (!Number.isFinite(ts)) return null;
    return new Date(ts).toLocaleDateString();
  }, [subscription?.current_period_end]);

  const statusLabel = useMemo(() => {
    if (!subscription) return null;
    if (subscription.status !== 'active') return 'Expired';
    if (subscription.cancel_at_period_end || !subscription.auto_renews) {
      return periodEndLabel ? `Active • Ends ${periodEndLabel}` : 'Active • Ends soon';
    }
    return periodEndLabel ? `Active • Renews ${periodEndLabel}` : 'Active • Renews soon';
  }, [periodEndLabel, subscription]);

  const handleCancelSubscription = () => {
    if (cancelling) return;
    Alert.alert('Cancel subscription', 'You’ll keep Plus benefits until the end of the paid period.', [
      { text: 'Nevermind', style: 'cancel' },
      {
        text: 'Cancel subscription',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            const res = await cancelMySubscription();
            if (!res.ok) {
              Alert.alert('Error', res.error || 'Failed to cancel. Please try again.');
              return;
            }
            await Promise.allSettled([refreshEntitlements(), refreshSubscription()]);
            Alert.alert('Cancelled', 'Your subscription will stop renewing at the end of the current period.');
          } catch (e: any) {
            console.error('[SubscriptionScreen] cancel failed:', e);
            Alert.alert('Error', e?.message || 'Failed to cancel. Please try again.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  return (
    <ScreenContainer>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {isPlus && subscription?.status === 'active' && (
          <View style={styles.currentPlanSection}>
            <AppText variant="body" style={styles.currentPlanLabel}>
              Current plan
            </AppText>
            <AppText variant="heading" style={styles.currentPlanName}>
              Pawfectly+
            </AppText>
            <AppText variant="caption" style={styles.currentPlanPrice}>
              {statusLabel || 'Active'}
            </AppText>
            <AppButton
              variant="ghost"
              onPress={handleCancelSubscription}
              style={styles.cancelButton}
              disabled={cancelling || subscription.cancel_at_period_end || !subscription.auto_renews}
            >
              {subscription.cancel_at_period_end || !subscription.auto_renews ? 'Cancellation scheduled' : 'Cancel subscription'}
            </AppButton>
          </View>
        )}

        <Card style={styles.plansSection}>
          <AppText variant="heading" style={styles.sectionTitle}>
            Subscription
          </AppText>
          <AppText variant="body" style={{ opacity: 0.8, marginBottom: Spacing.md }}>
            Renews automatically. Cancel anytime in Settings.
          </AppText>
          <AppButton
            variant="primary"
            onPress={() => router.push('/(tabs)/account/plus')}
            disabled={loadingSubscription || loadingEntitlements}
            style={styles.subscribeButton}
          >
            {isPlus ? 'View plans' : 'Upgrade to Plus'}
          </AppButton>
        </Card>
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
  currentPlanSection: {
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderRadius: 12,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  currentPlanLabel: {
    opacity: 0.7,
    marginBottom: Spacing.xs,
  },
  currentPlanName: {
    marginBottom: Spacing.xs,
  },
  currentPlanPrice: {
    opacity: 0.7,
    marginBottom: Spacing.md,
  },
  cancelButton: {
    marginTop: Spacing.sm,
  },
  plansSection: {
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.sm,
  },
  subscribeButton: {
    width: '100%',
  },
});

