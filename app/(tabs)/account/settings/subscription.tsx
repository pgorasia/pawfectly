import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

interface SubscriptionPlan {
  id: string;
  name: string;
  duration: string;
  price: string;
  features: string[];
  popular?: boolean;
}

const PLANS: SubscriptionPlan[] = [
  {
    id: '1-month',
    name: '1 Month',
    duration: '1 month',
    price: '$9.99',
    features: [
      'See who liked you',
      'Unlimited swipes',
      'Advanced filters',
      'Read receipts',
    ],
  },
  {
    id: '3-months',
    name: '3 Months',
    duration: '3 months',
    price: '$24.99',
    features: [
      'See who liked you',
      'Unlimited swipes',
      'Advanced filters',
      'Read receipts',
      'Priority support',
    ],
    popular: true,
  },
  {
    id: '6-months',
    name: '6 Months',
    duration: '6 months',
    price: '$39.99',
    features: [
      'See who liked you',
      'Unlimited swipes',
      'Advanced filters',
      'Read receipts',
      'Priority support',
      'Profile boost',
    ],
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState<string | null>('3-months'); // Mock current plan

  const handleSubscribe = (planId: string) => {
    Alert.alert(
      'Subscribe',
      `Subscribe to ${PLANS.find((p) => p.id === planId)?.name} plan?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Subscribe',
          onPress: () => {
            // In production, this would call a payment API
            setCurrentPlan(planId);
            Alert.alert('Success', 'Subscription updated successfully!');
          },
        },
      ]
    );
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            setCurrentPlan(null);
            Alert.alert('Cancelled', 'Your subscription has been cancelled.');
          },
        },
      ]
    );
  };

  return (
    <ScreenContainer>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              // Navigate to settings if no history
              router.replace('/(tabs)/account/settings');
            }
          }}>
            <AppText variant="body" style={styles.backButton}>
              ← Back
            </AppText>
          </TouchableOpacity>
          <AppText variant="heading" style={styles.title}>
            Subscription
          </AppText>
        </View>

        {currentPlan && (
          <View style={styles.currentPlanSection}>
            <AppText variant="body" style={styles.currentPlanLabel}>
              Current Plan
            </AppText>
            <AppText variant="heading" style={styles.currentPlanName}>
              {PLANS.find((p) => p.id === currentPlan)?.name}
            </AppText>
            <AppText variant="caption" style={styles.currentPlanPrice}>
              {PLANS.find((p) => p.id === currentPlan)?.price} / {PLANS.find((p) => p.id === currentPlan)?.duration}
            </AppText>
            <AppButton
              variant="ghost"
              onPress={handleCancelSubscription}
              style={styles.cancelButton}
            >
              Cancel Subscription
            </AppButton>
          </View>
        )}

        <View style={styles.plansSection}>
          <AppText variant="heading" style={styles.sectionTitle}>
            Choose a Plan
          </AppText>
          {PLANS.map((plan) => {
            const isCurrentPlan = currentPlan === plan.id;
            return (
              <Card key={plan.id} style={[styles.planCard, plan.popular && styles.planCardPopular]}>
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <AppText variant="caption" style={styles.popularBadgeText}>
                      Most Popular
                    </AppText>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <AppText variant="heading" style={styles.planName}>
                    {plan.name}
                  </AppText>
                  <AppText variant="heading" style={styles.planPrice}>
                    {plan.price}
                  </AppText>
                </View>
                <AppText variant="caption" style={styles.planDuration}>
                  {plan.duration}
                </AppText>
                <View style={styles.featuresList}>
                  {plan.features.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                      <AppText variant="caption" style={styles.checkmark}>
                        ✓
                      </AppText>
                      <AppText variant="caption" style={styles.featureText}>
                        {feature}
                      </AppText>
                    </View>
                  ))}
                </View>
                <AppButton
                  variant={isCurrentPlan ? 'ghost' : 'primary'}
                  onPress={() => handleSubscribe(plan.id)}
                  style={styles.subscribeButton}
                  disabled={isCurrentPlan}
                >
                  {isCurrentPlan ? 'Current Plan' : 'Subscribe'}
                </AppButton>
              </Card>
            );
          })}
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
  backButton: {
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.sm,
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
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  planCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    position: 'relative',
  },
  planCardPopular: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: Spacing.lg,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: Colors.background,
    fontWeight: '600',
    fontSize: 10,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  planName: {
    flex: 1,
  },
  planPrice: {
    color: Colors.primary,
  },
  planDuration: {
    opacity: 0.7,
    marginBottom: Spacing.md,
  },
  featuresList: {
    marginBottom: Spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  checkmark: {
    color: Colors.primary,
    marginRight: Spacing.sm,
    fontWeight: 'bold',
  },
  featureText: {
    opacity: 0.8,
  },
  subscribeButton: {
    width: '100%',
  },
});

