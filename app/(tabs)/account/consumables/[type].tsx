import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { ResetDislikesModal } from '@/components/account/ResetDislikesModal';
import { useMe } from '@/contexts/MeContext';
import { clearDislikeOutbox, markLanesForRefresh, resetDislikes } from '@/services/feed/feedService';
import { useMyConsumables } from '@/hooks/useMyConsumables';

type ConsumableType = 'boost' | 'rewind' | 'compliment' | 'reset-dislikes';

type Option = {
  id: string;
  label: string;
  subtitle?: string;
  price?: string; // Not implemented yet
};

type Definition = {
  title: string;
  description: string;
  notes?: string;
  options: Option[];
  faq: Array<{ q: string; a: string }>;
  supportsImmediateUse?: boolean;
};

const DEFINITIONS: Record<ConsumableType, Definition> = {
  boost: {
    title: 'Boost',
    description: 'Boost your profile to get more views. Boost can be used once a day.',
    options: [
      { id: '1', label: '1 Boost', price: '$3.99' },
      { id: '3', label: '3 Boosts', subtitle: '≈ $3.33 each', price: '$9.99' },
      { id: '5', label: '5 Boosts', subtitle: '≈ $3.00 each', price: '$14.99' },
    ],
    faq: [
      {
        q: 'How does Boost work?',
        a: 'Boost temporarily increases your visibility so more people see you.',
      },
    ],
  },
  rewind: {
    title: 'Rewind',
    description: 'Go back and undo your last pass.',
    options: [
      { id: '3', label: '3 Rewinds', price: '$1.99' },
      { id: '7', label: '7 Rewinds', price: '$3.99' },
      { id: '10', label: '10 Rewinds', price: '$4.99' },
    ],
    faq: [
      {
        q: 'When can I use Rewind?',
        a: 'Rewind can be used after a pass to bring the last profile back.',
      },
    ],
  },
  compliment: {
    title: 'Compliment',
    description: 'Send a message with your like to stand out.',
    options: [
      { id: '1', label: '1 Compliment', price: '$2.99' },
      { id: '5', label: '5 Compliments', subtitle: '≈ $2.00 each', price: '$9.99' },
      { id: '10', label: '10 Compliments', subtitle: '≈ $1.50 each', price: '$14.99' },
    ],
    faq: [
      {
        q: 'Do compliments guarantee a match?',
        a: 'No—compliments help you stand out, but the other person still decides.',
      },
    ],
  },
  'reset-dislikes': {
    title: 'Reset dislikes',
    description: 'Clear your rejected profiles so you can see them again.',
    notes: 'This action affects your feed lanes and may take a moment to refresh.',
    options: [{ id: 'one', label: '1 Reset', price: '$4.99' }],
    faq: [
      {
        q: 'What happens after I reset?',
        a: 'Your feed will refresh automatically and previously rejected profiles may reappear.',
      },
    ],
    supportsImmediateUse: true,
  },
};

function FaqItem({ q, a }: { q: string; a: string }) {
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

export default function ConsumableScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const rawType = params.type ?? '';
  const type = rawType as ConsumableType;

  const def = DEFINITIONS[type];

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(def?.options?.[0]?.id ?? null);

  // Reset dislikes flow (existing production logic; moved out of Settings)
  const { me } = useMe();
  const { byType } = useMyConsumables();
  const [showResetDislikesModal, setShowResetDislikesModal] = useState(false);
  const [resettingDislikes, setResettingDislikes] = useState(false);

  const handleResetDislikes = async (lanes: Array<'pals' | 'match'>) => {
    if (resettingDislikes) return;

    setResettingDislikes(true);
    try {
      await clearDislikeOutbox(lanes);
      await resetDislikes(lanes);
      await markLanesForRefresh(lanes);

      setShowResetDislikesModal(false);
      Alert.alert('Success', 'Dislikes have been reset. The feed will refresh automatically.', [
        {
          text: 'OK',
          onPress: () => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)/index');
            }
          },
        },
      ]);
    } catch (error: any) {
      console.error('[ConsumableScreen] Failed to reset dislikes:', error);
      Alert.alert('Error', error?.message || 'Failed to reset dislikes. Please try again.');
    } finally {
      setResettingDislikes(false);
    }
  };

  const title = def?.title ?? 'Consumable';

  const selectedOption = useMemo(
    () => def?.options?.find((o) => o.id === selectedOptionId) ?? null,
    [def?.options, selectedOptionId]
  );

  if (!def) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ title: 'Consumable' }} />
        <View style={{ paddingTop: Spacing.lg }}>
          <AppText variant="heading">Not found</AppText>
          <AppText variant="body" style={{ opacity: 0.75, marginTop: Spacing.sm }}>
            This consumable type is not supported.
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Stack.Screen options={{ title }} />

      <View style={styles.header}>
        <AppText variant="heading" style={styles.title}>
          {def.title}
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          {def.description}
        </AppText>
        {(() => {
          const key =
            type === 'reset-dislikes' ? 'reset_dislikes' : (type as any);
          const row = byType(key);
          if (!row) return null;
          return (
            <AppText variant="caption" style={styles.note}>
              Uses left: {row.balance}
            </AppText>
          );
        })()}
        {!!def.notes && (
          <AppText variant="caption" style={styles.note}>
            {def.notes}
          </AppText>
        )}
      </View>

      <View style={styles.options}>
        {def.options.map((o) => {
          const selected = o.id === selectedOptionId;
          return (
            <TouchableOpacity
              key={o.id}
              style={[styles.optionTile, selected && styles.optionTileSelected]}
              onPress={() => setSelectedOptionId(o.id)}
              activeOpacity={0.85}
            >
              <View style={styles.optionText}>
                <AppText variant="body" style={styles.optionTitle}>
                  {o.label}
                </AppText>
                {!!o.subtitle && (
                  <AppText variant="caption" style={styles.optionSubtitle}>
                    {o.subtitle}
                  </AppText>
                )}
              </View>
              <AppText variant="body" style={styles.optionPrice}>
                {o.price ?? '—'}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>

      <Card style={styles.faqCard}>
        <AppText variant="heading" style={styles.faqTitle}>
          FAQs
        </AppText>
        <View style={styles.faqList}>
          {def.faq.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </View>
      </Card>

      <View style={styles.cta}>
        {type === 'reset-dislikes' ? (
          <AppButton
            variant="primary"
            onPress={() => {
              const row = byType('reset_dislikes');
              if (!row || row.balance <= 0) {
                Alert.alert('Purchase required', 'You need at least 1 reset to use this feature.');
                return;
              }
              setShowResetDislikesModal(true);
            }}
            disabled={resettingDislikes}
            style={styles.ctaButton}
          >
            Reset dislikes
          </AppButton>
        ) : (
          <AppButton
            variant="primary"
            onPress={() => {
              Alert.alert(
                'Coming soon',
                'Purchases are not enabled yet. This screen is ready to be wired into RevenueCat (or equivalent) once billing is implemented.'
              );
            }}
            style={styles.ctaButton}
          >
            Purchase {selectedOption?.label ?? ''}
          </AppButton>
        )}
      </View>

      {type === 'reset-dislikes' && (
        <ResetDislikesModal
          visible={showResetDislikesModal}
          onClose={() => setShowResetDislikesModal(false)}
          onSubmit={handleResetDislikes}
          loading={resettingDislikes}
          palsEnabled={me.preferencesRaw.pals_enabled}
          matchEnabled={me.preferencesRaw.match_enabled}
        />
      )}
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
    opacity: 0.8,
  },
  note: {
    marginTop: Spacing.sm,
    opacity: 0.7,
  },
  options: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  optionTile: {
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 16,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  optionTileSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  optionSubtitle: {
    opacity: 0.7,
  },
  optionPrice: {
    fontWeight: '700',
    color: Colors.primary,
  },
  faqCard: {
    marginBottom: Spacing.xl,
  },
  faqTitle: {
    marginBottom: Spacing.md,
  },
  faqList: {
    gap: Spacing.sm,
  },
  faqItem: {
    backgroundColor: 'rgba(31, 41, 55, 0.04)',
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

