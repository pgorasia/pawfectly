import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

type PlanKey = 'm1' | 'm3' | 'm6';

type Plan = {
  key: PlanKey;
  months: 1 | 3 | 6;
  durationLabel: '1 month' | '3 months' | '6 months';
  pricePerMonth: number;
  saveLabel?: string;
  bottomTag?: string;
};

const PLANS: Plan[] = [
  {
    key: 'm1',
    months: 1,
    durationLabel: '1 month',
    pricePerMonth: 19.99,
    saveLabel: 'Basic',
  },
  {
    key: 'm3',
    months: 3,
    durationLabel: '3 months',
    pricePerMonth: 14.99,
    saveLabel: 'Save 25%',
  },
  {
    key: 'm6',
    months: 6,
    durationLabel: '6 months',
    pricePerMonth: 11.99,
    saveLabel: 'Save 40%',
    bottomTag: 'Most Popular',
  },
];

type ComparisonCell = 'x' | 'check' | string;

const COMPARISON_ROWS: { feature: string; free: ComparisonCell; plus: ComparisonCell }[] = [
  { feature: 'See who likes you', free: 'x', plus: 'check' },
  { feature: 'Advanced dog filters', free: 'x', plus: 'check' },
  { feature: 'Text read receipts', free: 'x', plus: 'check' },
  { feature: 'Match Likes', free: '7/day', plus: '20/day' },
  { feature: 'Pals Likes', free: '15/day', plus: '40/day' },
  { feature: 'Rewinds', free: 'x', plus: 'Unlimited' },
  { feature: 'Boosts', free: 'x', plus: '2/week' },
  { feature: 'Compliments', free: 'x', plus: '5/week' },
  { feature: 'Reset passes/skips', free: 'x', plus: '1/month' },
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
  const [selected, setSelected] = useState<PlanKey>('m6');
  const [showComparison, setShowComparison] = useState(false);

  const selectedPlan = useMemo(() => PLANS.find((p) => p.key === selected)!, [selected]);
  const selectedTotal = useMemo(
    () => Number((selectedPlan.pricePerMonth * selectedPlan.months).toFixed(2)),
    [selectedPlan.months, selectedPlan.pricePerMonth]
  );

  const handleUpgrade = () => {
    Alert.alert(
      'Coming soon',
      'Subscriptions are not enabled yet. This screen is ready to be wired into RevenueCat (or equivalent) once billing is implemented.'
    );
  };

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title: 'Upgrade to Plus' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText variant="body" style={styles.subtitle}>
            Match faster, see who’s into you, and get more control.
          </AppText>
        </View>

        {showComparison ? (
          <Card style={styles.comparisonCard}>
            <AppText variant="heading" style={styles.comparisonTitle}>
              Perks
            </AppText>

            <View style={styles.tableHeaderRow}>
              <AppText variant="caption" style={[styles.tableHeaderCell, styles.featureCell]}>
                Perks
              </AppText>
              <View style={styles.valueCell}>
                <AppText variant="caption" style={styles.tableHeaderCell}>
                  Free
                </AppText>
              </View>
              <View style={styles.valueCell}>
                <AppText variant="caption" style={styles.tableHeaderCell}>
                  Plus
                </AppText>
              </View>
            </View>

            <View style={styles.tableDivider} />

            {COMPARISON_ROWS.map((row) => (
              <View key={row.feature} style={styles.tableRow}>
                <AppText variant="body" style={styles.featureCell}>
                  {row.feature}
                </AppText>
                <View style={styles.valueCell}>
                  {row.free === 'check' ? (
                    <MaterialIcons name="check" size={18} color={stylesVars.yesGreen} />
                  ) : row.free === 'x' ? (
                    <MaterialIcons name="close" size={18} color={stylesVars.noGray} />
                  ) : (
                    <AppText variant="caption" style={styles.valueText}>
                      {row.free}
                    </AppText>
                  )}
                </View>
                <View style={styles.valueCell}>
                  {row.plus === 'check' ? (
                    <MaterialIcons name="check" size={18} color={stylesVars.yesGreen} />
                  ) : row.plus === 'x' ? (
                    <MaterialIcons name="close" size={18} color={stylesVars.noGray} />
                  ) : (
                    <AppText variant="caption" style={styles.valueText}>
                      {row.plus}
                    </AppText>
                  )}
                </View>
              </View>
            ))}

            <AppButton
              variant="secondary"
              onPress={() => setShowComparison(false)}
              style={styles.seeWhatYouGetButton}
            >
              See what you get
            </AppButton>
          </Card>
        ) : (
          <Card style={styles.plusGivesYouCard}>
            <AppText variant="heading" style={styles.plusGivesYouTitle}>
              Plus gives you…
            </AppText>
            <View style={styles.plusGivesYouList}>
              <View style={styles.plusGivesYouRow}>
                <MaterialIcons name="check" size={18} color={stylesVars.yesGreen} />
                <AppText variant="body" style={styles.plusGivesYouText}>
                  Get matches faster (more likes + boosts)
                </AppText>
              </View>
              <View style={styles.plusGivesYouRow}>
                <MaterialIcons name="check" size={18} color={stylesVars.yesGreen} />
                <AppText variant="body" style={styles.plusGivesYouText}>
                  Value for likes (See who likes you)
                </AppText>
              </View>
              <View style={styles.plusGivesYouRow}>
                <MaterialIcons name="check" size={18} color={stylesVars.yesGreen} />
                <AppText variant="body" style={styles.plusGivesYouText}>
                  More control (rewinds + reset)
                </AppText>
              </View>
            </View>

            <AppButton
              variant="secondary"
              onPress={() => setShowComparison(true)}
              style={styles.seeWhatYouGetButton}
            >
              See what you get
            </AppButton>
          </Card>
        )}

        <View style={styles.plansRow}>
          {PLANS.map((plan) => {
            const isSelected = plan.key === selected;
            const pricePerMonthLabel = `$${plan.pricePerMonth.toFixed(2)}/mo`;

            return (
              <View key={plan.key} style={styles.planWrap}>
                {!!plan.saveLabel && (
                  <View style={[styles.planTopPill, isSelected && styles.planTopPillSelected]}>
                    <AppText variant="caption" style={styles.planTopPillText}>
                      {plan.saveLabel}
                    </AppText>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.planTile, isSelected && styles.planTileSelected]}
                  onPress={() => setSelected(plan.key)}
                  activeOpacity={0.85}
                >
                  <View style={styles.planMain}>
                    <AppText variant="body" style={styles.planDurationHeading} numberOfLines={1}>
                      {plan.durationLabel}
                    </AppText>
                    <AppText variant="caption" style={styles.planPricePerMonth}>
                      {pricePerMonthLabel}
                    </AppText>
                  </View>
                </TouchableOpacity>

                {!!plan.bottomTag && (
                  <View style={styles.planBottomPill}>
                    <AppText variant="caption" style={styles.planBottomPillText}>
                      {plan.bottomTag}
                    </AppText>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.cta}>
          <AppButton variant="primary" onPress={handleUpgrade} style={styles.ctaButton}>
            Get {selectedPlan.months} month{selectedPlan.months === 1 ? '' : 's'} for ${selectedTotal}
          </AppButton>
        </View>

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
      </ScrollView>
    </ScreenContainer>
  );
}

const stylesVars = {
  yesGreen: '#22C55E',
  noGray: 'rgba(31, 41, 55, 0.45)',
} as const;

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  header: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  subtitle: {
    opacity: 0.75,
  },
  plansRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  planWrap: {
    flex: 1,
    alignItems: 'center',
  },
  planTopPill: {
    marginBottom: -10,
    zIndex: 2,
    elevation: 2,
    backgroundColor: Colors.background,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.12)',
  },
  planTopPillSelected: {
    borderColor: Colors.primary,
  },
  planTopPillText: {
    fontWeight: '800',
    fontSize: 10,
    color: Colors.text,
  },
  planTile: {
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 16,
    padding: Spacing.md,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'transparent',
    width: '100%',
    minHeight: 132,
    justifyContent: 'space-between',
  },
  planTileSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  planMain: {
    gap: 2,
    alignItems: 'center',
  },
  planDurationHeading: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
  },
  planPricePerMonth: {
    textAlign: 'center',
    opacity: 0.75,
    fontWeight: '700',
  },
  planBottomPill: {
    marginTop: -10,
    zIndex: 2,
    elevation: 2,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  planBottomPillText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 10,
  },
  plusGivesYouCard: {
    marginBottom: Spacing.xl,
  },
  plusGivesYouTitle: {
    marginBottom: Spacing.md,
  },
  plusGivesYouList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  plusGivesYouRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  plusGivesYouText: {
    flex: 1,
    opacity: 0.9,
  },
  seeWhatYouGetButton: {
    width: '100%',
  },
  comparisonTop: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  comparisonCard: {
    marginBottom: Spacing.xl,
  },
  comparisonTitle: {
    marginBottom: 0,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableHeaderCell: {
    opacity: 0.7,
    fontWeight: '700',
  },
  tableDivider: {
    height: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.10)',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  featureCell: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  valueCell: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    opacity: 0.8,
    fontWeight: '700',
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
    paddingTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  ctaButton: {
    width: '100%',
  },
});

