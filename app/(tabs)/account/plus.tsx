import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

type PlanKey = 'silver' | 'gold' | 'platinum';

type Plan = {
  key: PlanKey;
  title: string;
  durationLabel: string;
  price: string;
  badge?: { label: string };
  sublabel?: string;
};

const PLANS: Plan[] = [
  {
    key: 'silver',
    title: 'Silver+',
    durationLabel: '1 month',
    price: '$19.99',
  },
  {
    key: 'gold',
    title: 'Gold+',
    durationLabel: '3 months',
    price: '$44.99',
    badge: { label: 'Most Popular' },
    sublabel: '25% off',
  },
  {
    key: 'platinum',
    title: 'Platinum+',
    durationLabel: '6 months',
    price: '$74.99',
    badge: { label: 'Best Value' },
    sublabel: '37% off',
  },
];

const PERKS = [
  'See who liked you',
  'Advanced filters',
  'Text read receipts',
  'Match likes: 20/day',
  'Pals likes: 40/day',
  'Boost: 2/week',
  'Rewind: Unlimited',
  'Compliment: 5/week',
  'Reset dislikes: 1/month',
];

function FaqItem({
  q,
  a,
}: {
  q: string;
  a: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setOpen((v) => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.faqHeader}>
        <AppText variant="body" style={styles.faqQuestion}>
          {q}
        </AppText>
        <AppText variant="body" style={styles.faqChevron}>
          {open ? '–' : '+'}
        </AppText>
      </View>
      {open && (
        <AppText variant="caption" style={styles.faqAnswer}>
          {a}
        </AppText>
      )}
    </TouchableOpacity>
  );
}

export default function PlusScreen() {
  const [selected, setSelected] = useState<PlanKey>('gold');

  const selectedPlan = useMemo(() => PLANS.find((p) => p.key === selected)!, [selected]);

  const handleUpgrade = () => {
    Alert.alert(
      'Coming soon',
      'Subscriptions are not enabled yet. This screen is ready to be wired into RevenueCat (or equivalent) once billing is implemented.'
    );
  };

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title: 'Pawfectly +' }} />

      <View style={styles.header}>
        <AppText variant="heading" style={styles.title}>
          Choose your plan
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Cancel anytime. Your plan works across devices.
        </AppText>
      </View>

      <View style={styles.plansGrid}>
        {PLANS.map((plan) => {
          const isSelected = plan.key === selected;
          return (
            <TouchableOpacity
              key={plan.key}
              style={[styles.planTile, isSelected && styles.planTileSelected]}
              onPress={() => setSelected(plan.key)}
              activeOpacity={0.85}
            >
              {!!plan.badge && (
                <View style={styles.planBadge}>
                  <AppText variant="caption" style={styles.planBadgeText}>
                    {plan.badge.label}
                  </AppText>
                </View>
              )}
              <AppText variant="heading" style={styles.planTitle}>
                {plan.title}
              </AppText>
              <AppText variant="caption" style={styles.planDuration}>
                {plan.durationLabel}
              </AppText>
              <AppText variant="heading" style={styles.planPrice}>
                {plan.price}
              </AppText>
              {!!plan.sublabel && (
                <AppText variant="caption" style={styles.planSublabel}>
                  {plan.sublabel}
                </AppText>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Card style={styles.perksCard}>
        <AppText variant="heading" style={styles.perksTitle}>
          What you get
        </AppText>
        <View style={styles.perksList}>
          {PERKS.map((perk) => (
            <View key={perk} style={styles.perkRow}>
              <AppText variant="body" style={styles.perkCheck}>
                ✓
              </AppText>
              <AppText variant="body" style={styles.perkText}>
                {perk}
              </AppText>
            </View>
          ))}
        </View>
      </Card>

      <View style={styles.faqSection}>
        <AppText variant="heading" style={styles.faqTitle}>
          FAQs
        </AppText>
        <FaqItem
          q="When will I be charged?"
          a="You’ll be charged when billing is enabled and you confirm your purchase. Until then, this is a preview of the upgrade flow."
        />
        <FaqItem
          q="How do I cancel?"
          a="Once billing is enabled, you’ll be able to manage or cancel from Settings → Subscription."
        />
      </View>

      <View style={styles.cta}>
        <AppButton variant="primary" onPress={handleUpgrade} style={styles.ctaButton}>
          Upgrade to {selectedPlan.title}
        </AppButton>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    opacity: 0.75,
  },
  plansGrid: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  planTile: {
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 16,
    padding: Spacing.lg,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  planTileSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  planBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  planBadgeText: {
    color: Colors.background,
    fontWeight: '700',
    fontSize: 11,
  },
  planTitle: {
    marginBottom: 4,
  },
  planDuration: {
    opacity: 0.7,
    marginBottom: Spacing.md,
  },
  planPrice: {
    color: Colors.primary,
  },
  planSublabel: {
    marginTop: 4,
    opacity: 0.75,
    fontWeight: '600',
  },
  perksCard: {
    marginBottom: Spacing.xl,
  },
  perksTitle: {
    marginBottom: Spacing.md,
  },
  perksList: {
    gap: Spacing.sm,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  perkCheck: {
    color: Colors.primary,
    fontWeight: '800',
    width: 18,
    textAlign: 'center',
  },
  perkText: {
    flex: 1,
    opacity: 0.9,
  },
  faqSection: {
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  faqTitle: {
    marginBottom: Spacing.xs,
  },
  faqItem: {
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 12,
    padding: Spacing.md,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  faqQuestion: {
    flex: 1,
    fontWeight: '600',
  },
  faqChevron: {
    opacity: 0.6,
    fontWeight: '700',
    fontSize: 18,
  },
  faqAnswer: {
    marginTop: Spacing.sm,
    opacity: 0.75,
    lineHeight: 18,
  },
  cta: {
    paddingBottom: Spacing.xl,
  },
  ctaButton: {
    width: '100%',
  },
});

