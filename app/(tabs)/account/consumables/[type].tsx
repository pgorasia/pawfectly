import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';
import { ResetDislikesModal } from '@/components/account/ResetDislikesModal';
import { useMe } from '@/contexts/MeContext';
import { clearDislikeOutbox, markLanesForRefresh, resetDislikes } from '@/services/feed/feedService';
import { useMyConsumables } from '@/hooks/useMyConsumables';
import { consumeMyConsumable, purchaseConsumable } from '@/services/consumables/consumablesService';
import { useMyEntitlements } from '@/hooks/useMyEntitlements';
import { isEntitlementActive } from '@/services/entitlements/entitlementsService';
import { ConsumableUpsellModal } from '@/components/account/ConsumableUpsellModal';
import { useMyBoostStatus } from '@/hooks/useMyBoostStatus';

type ConsumableType = 'boost' | 'rewind' | 'compliment' | 'reset-dislikes';

type Option = {
  id: string;
  label: string;
  subtitle?: string;
  price?: string; // Not implemented yet
  popular?: boolean;
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
    description: 'Get seen by more people for the next 60 minutes.',
    options: [
      { id: '1', label: '1 Boost', price: '$3.99' },
      { id: '3', label: '3 Boosts', subtitle: '≈ $3.33 each', price: '$9.99' },
      { id: '5', label: '5 Boosts', subtitle: '≈ $3.00 each', price: '$14.99', popular: true },
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
    description: 'Undo your last swipe and take another look.',
    options: [
      { id: '3', label: '3 Rewinds', price: '$1.99' },
      { id: '7', label: '7 Rewinds', price: '$3.99' },
      { id: '10', label: '10 Rewinds', price: '$4.99', popular: true },
    ],
    faq: [
      {
        q: 'When can I use Rewind?',
        a: 'Rewind can be used after a pass to bring the last profile back.',
      },
    ],
  },
  compliment: {
    title: 'Compliments',
    description: 'Stand out by adding a message to your like.',
    options: [
      { id: '1', label: '1 Compliment', price: '$2.99' },
      { id: '5', label: '5 Compliments', subtitle: '≈ $2.00 each', price: '$9.99', popular: true },
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
    title: 'Reset passes/skips',
    description: 'Clear your passes/skips and see those profiles back in your feed.',
    notes: 'This action affects your feed lanes and may take a moment to refresh.',
    options: [{ id: 'one', label: '1 Reset', price: '$4.99' }],
    faq: [
      {
        q: 'What happens after I reset?',
        a: 'Your feed will refresh automatically and previously passed profiles may reappear.',
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

  const chipsTypes: ConsumableType[] = ['boost', 'rewind', 'compliment'];
  const isChipsType = chipsTypes.includes(type);

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(() => {
    // Boost: default selection should be 3-pack (chips UI)
    if (type === 'boost') return '3';
    // Other chips pages: default to "most popular" pack
    if (isChipsType) return def?.options?.find((o) => o.popular)?.id ?? def?.options?.[0]?.id ?? null;
    return def?.options?.[0]?.id ?? null;
  });

  // Reset dislikes flow (existing production logic; moved out of Settings)
  const { me } = useMe();
  const { byType, refresh: refreshConsumables } = useMyConsumables();
  const { data: entitlements } = useMyEntitlements();
  const isPlus = isEntitlementActive(entitlements, 'plus');
  const [showResetDislikesModal, setShowResetDislikesModal] = useState(false);
  const [resettingDislikes, setResettingDislikes] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [showBoostPackPicker, setShowBoostPackPicker] = useState(false);
  const [startingBoost, setStartingBoost] = useState(false);
  const boost = useMyBoostStatus(type === 'boost');

  const resetsAvailable = byType('reset_dislikes')?.balance ?? 0;
  const boostsAvailable = byType('boost')?.balance ?? 0;

  // Boost timer is driven by cached ends_at (server-authoritative); see useMyBoostStatus().

  const handleResetDislikes = async (lanes: Array<'pals' | 'match'>) => {
    if (resettingDislikes) return;

    setResettingDislikes(true);
    try {
      await clearDislikeOutbox(lanes);
      await resetDislikes(lanes);
      await markLanesForRefresh(lanes);

      // Track usage (consumes included first, then purchased)
      try {
        await consumeMyConsumable('reset_dislikes', 1);
        await refreshConsumables();
      } catch (e) {
        console.error('[ConsumableScreen] Failed to consume reset_dislikes:', e);
      }

      setShowResetDislikesModal(false);
      Alert.alert('Success', 'Passes/skips have been reset. The feed will refresh automatically.', [
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
      Alert.alert('Error', error?.message || 'Failed to reset passes/skips. Please try again.');
    } finally {
      setResettingDislikes(false);
    }
  };

  const apiType = useMemo(() => {
    if (type === 'reset-dislikes') return 'reset_dislikes';
    return type as any;
  }, [type]);

  const selectedOption = useMemo(
    () => def?.options?.find((o) => o.id === selectedOptionId) ?? null,
    [def?.options, selectedOptionId]
  );

  const selectedQuantity = useMemo(() => {
    // Fallback safely to 1 so we never block purchase flows in the stubbed-billing phase.
    if (!selectedOption?.id) return 1;
    const n = Number(selectedOption.id);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    if (selectedOption.id === 'one') return 1;
    return 1;
  }, [selectedOption?.id]);

  const handlePurchaseOneReset = async () => {
    if (purchasing) return;
    setPurchasing(true);
    try {
      const res = await purchaseConsumable('reset_dislikes', 1);
      if (!res.ok) {
        Alert.alert('Purchase failed', res.error || 'Please try again.');
        return;
      }
      await refreshConsumables();
      Alert.alert('Purchased', 'Added 1 reset.');
    } catch (e: any) {
      console.error('[ConsumableScreen] purchase failed:', e);
      Alert.alert('Purchase failed', e?.message || 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handlePurchase = async () => {
    if (purchasing) return;
    if (!apiType) return;
    const qty = selectedQuantity;
    setPurchasing(true);
    try {
      const res = await purchaseConsumable(apiType, qty);
      if (!res.ok) {
        Alert.alert('Purchase failed', res.error || 'Please try again.');
        return;
      }
      await refreshConsumables();
      Alert.alert(
        'Purchased',
        `Added ${qty} ${type === 'reset-dislikes' ? 'reset' : type}${qty === 1 ? '' : 's'}.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // For reset passes/skips, keep user on this page so they can use it immediately.
              if (type !== 'reset-dislikes') {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/(tabs)/account');
                }
              }
            },
          },
        ]
      );
    } catch (e: any) {
      console.error('[ConsumableScreen] purchase failed:', e);
      Alert.alert('Purchase failed', e?.message || 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const title = def?.title ?? 'Consumable';

  const currentBalance = useMemo(() => {
    const key = type === 'reset-dislikes' ? 'reset_dislikes' : (type as any);
    const row = byType(key);
    return row?.balance ?? 0;
  }, [byType, type]);

  if (!def) {
    return (
      <ScreenContainer>
        <Stack.Screen options={{ ...DEFAULT_HEADER_OPTIONS, title: 'Consumable' }} />
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
      <Stack.Screen options={{ ...DEFAULT_HEADER_OPTIONS, title }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <AppText variant="heading" style={styles.title}>
            {def.title}
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            {def.description}
          </AppText>
          {type === 'boost' ? (
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <AppText variant="caption" style={styles.pillText}>
                  Boosts available: {boostsAvailable}
                </AppText>
              </View>
            </View>
          ) : type === 'rewind' ? (
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <AppText variant="caption" style={styles.pillText}>
                  Rewinds left: {currentBalance}
                </AppText>
              </View>
            </View>
          ) : type === 'compliment' ? (
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <AppText variant="caption" style={styles.pillText}>
                  Compliments left: {currentBalance}
                </AppText>
              </View>
            </View>
          ) : type === 'reset-dislikes' ? (
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <AppText variant="caption" style={styles.pillText}>
                  Resets available: {resetsAvailable}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText variant="caption" style={styles.note}>
              You have {currentBalance} left.
            </AppText>
          )}
          {!!def.notes && (
            <AppText variant="caption" style={styles.note}>
              {def.notes}
            </AppText>
          )}
        </View>

        {type === 'boost' && boost.isActive && (
          <Card style={styles.boostActiveCard}>
            <AppText variant="heading" style={styles.boostActiveTitle}>
              Boost active: {boost.formattedRemaining}
            </AppText>
            <AppText variant="caption" style={styles.boostActiveSub}>
              Boost is currently active
            </AppText>
          </Card>
        )}

        {type !== 'reset-dislikes' && !isChipsType && (
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
        )}

        <View style={styles.cta}>
          {type === 'boost' ? (
            <View style={{ gap: Spacing.sm }}>
              {boostsAvailable <= 0 ? (
                <>
                  {/* Inline pack selector when out */}
                  <View style={styles.boostChipsRow}>
                    {def.options.map((o) => {
                      const selected = o.id === selectedOptionId;
                      return (
                        <TouchableOpacity
                          key={o.id}
                          style={[styles.boostChip, selected && styles.boostChipSelected]}
                          onPress={() => setSelectedOptionId(o.id)}
                          activeOpacity={0.85}
                        >
                          {!!o.popular && (
                            <View style={styles.boostPopularTag}>
                              <AppText variant="caption" style={styles.boostPopularTagText}>
                                Most popular
                              </AppText>
                            </View>
                          )}
                          <AppText variant="body" style={styles.boostChipTitle}>
                            {o.label}
                          </AppText>
                          <AppText variant="caption" style={styles.boostChipPrice}>
                            {o.price ?? '—'}
                          </AppText>
                          {!!o.subtitle && (
                            <AppText variant="caption" style={styles.boostChipEach}>
                              {o.subtitle}
                            </AppText>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <AppButton
                    variant="primary"
                    onPress={() => {
                      handlePurchase().catch(() => {});
                    }}
                    disabled={purchasing}
                    style={styles.ctaButton}
                  >
                    Buy {selectedQuantity} Boost{selectedQuantity === 1 ? '' : 's'} for {selectedOption?.price ?? '—'}
                  </AppButton>

                  <AppButton
                    variant="secondary"
                    onPress={() => router.push('/(tabs)/account/plus')}
                    style={styles.ctaButton}
                  >
                    Get free boosts with Plus
                  </AppButton>
                  <AppText variant="caption" style={styles.helperText}>
                    Plus includes 2 boosts/week
                  </AppText>
                </>
              ) : (
                <>
                  <AppButton
                    variant="primary"
                    onPress={() => {
                      if (boost.isActive) return;
                      Alert.alert(
                        'Start a Boost now?',
                        "You’ll be near the top of the feed for 60 minutes.\n\nUse it when more people are active (evenings/weekends).",
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Start Boost',
                            onPress: async () => {
                              if (startingBoost) return;
                              setStartingBoost(true);
                              try {
                                const res = await boost.start();
                                if (!res.ok) {
                                  if (res.error === 'insufficient_boosts') {
                                    setShowBoostPackPicker(true);
                                    return;
                                  }
                                  Alert.alert('Unable to start boost', res.error || 'Please try again.');
                                  return;
                                }
                                await refreshConsumables();
                              } catch (e: any) {
                                console.error('[Boost] start failed:', e);
                                Alert.alert('Unable to start boost', e?.message || 'Please try again.');
                              } finally {
                                setStartingBoost(false);
                              }
                            },
                          },
                        ]
                      );
                    }}
                    disabled={startingBoost || boost.isActive}
                    style={styles.ctaButton}
                  >
                    Start Boost
                  </AppButton>

                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <AppButton
                        variant="secondary"
                        onPress={() => setShowBoostPackPicker(true)}
                        disabled={purchasing}
                        style={styles.ctaButton}
                      >
                        Buy more
                      </AppButton>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppButton
                        variant="secondary"
                        onPress={() => router.push('/(tabs)/account/plus')}
                        style={styles.ctaButton}
                      >
                        Upgrade to Plus
                      </AppButton>
                    </View>
                  </View>
                  <AppText variant="caption" style={styles.helperText}>
                    Plus includes 2 Boosts/week and more likes.
                  </AppText>
                </>
              )}
            </View>
        ) : type === 'rewind' || type === 'compliment' ? (
          <View style={{ gap: Spacing.sm }}>
            <View style={styles.boostChipsRow}>
              {def.options.map((o) => {
                const selected = o.id === selectedOptionId;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.boostChip, selected && styles.boostChipSelected]}
                    onPress={() => setSelectedOptionId(o.id)}
                    activeOpacity={0.85}
                  >
                    {!!o.popular && (
                      <View style={styles.boostPopularTag}>
                        <AppText variant="caption" style={styles.boostPopularTagText}>
                          Most popular
                        </AppText>
                      </View>
                    )}
                    <AppText variant="body" style={styles.boostChipTitle}>
                      {o.label}
                    </AppText>
                    <AppText variant="caption" style={styles.boostChipPrice}>
                      {o.price ?? '—'}
                    </AppText>
                    {!!o.subtitle && (
                      <AppText variant="caption" style={styles.boostChipEach}>
                        {o.subtitle}
                      </AppText>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <AppButton
              variant="primary"
              onPress={() => {
                handlePurchase().catch(() => {});
              }}
              style={styles.ctaButton}
              disabled={purchasing}
            >
              Buy {selectedQuantity} {type === 'rewind' ? 'Rewind' : 'Compliment'}
              {selectedQuantity === 1 ? '' : 's'} for {selectedOption?.price ?? '—'}
            </AppButton>

            {!isPlus && (
              <AppButton
                variant="secondary"
                onPress={() => router.push('/(tabs)/account/plus')}
                style={styles.ctaButton}
              >
                {type === 'rewind' ? 'Get unlimited rewinds with Plus' : 'Get 5 free compliments/week with Plus'}
              </AppButton>
            )}
          </View>
          ) : type === 'reset-dislikes' ? (
            <View style={{ gap: Spacing.sm }}>
              {resetsAvailable <= 0 ? (
                <AppButton
                  variant="primary"
                  onPress={() => {
                    handlePurchaseOneReset().catch(() => {});
                  }}
                  disabled={purchasing}
                  style={styles.ctaButton}
                >
                  Buy 1 Reset for $4.99
                </AppButton>
              ) : (
                <>
                  <AppButton
                    variant="primary"
                    onPress={() => setShowResetDislikesModal(true)}
                    disabled={resettingDislikes}
                    style={styles.ctaButton}
                  >
                    Reset Passes and Skips
                  </AppButton>
                  <AppText variant="caption" style={styles.helperText}>
                    You have {resetsAvailable} reset available.
                  </AppText>
                </>
              )}
            </View>
          ) : (
            <AppButton
              variant="primary"
              onPress={() => {
                handlePurchase().catch(() => {});
              }}
              style={styles.ctaButton}
              disabled={purchasing}
            >
              Purchase {selectedOption?.label ?? ''}
            </AppButton>
          )}
        </View>

        {type === 'reset-dislikes' && !isPlus && (
          <Card style={styles.plusUpsellCard}>
            <AppText variant="heading" style={styles.plusUpsellTitle}>
              Plus includes 1 Reset every month
            </AppText>
            <AppText variant="body" style={styles.plusUpsellBody}>
              Also includes See who likes you, boosts, rewinds…
            </AppText>
            <AppButton variant="primary" onPress={() => router.push('/(tabs)/account/plus')} style={styles.ctaButton}>
              Upgrade to Plus
            </AppButton>
          </Card>
        )}

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
      </ScrollView>

      {type === 'boost' && (
        <ConsumableUpsellModal
          visible={showBoostPackPicker}
          title="Get more boosts"
          message={isPlus ? 'Want to keep going? Grab more boosts anytime.' : 'Plus includes 2 boosts/week and more likes.'}
          options={[
            { quantity: 1, totalPriceLabel: '$3.99' },
            { quantity: 3, totalPriceLabel: '$9.99', subtitle: '≈ $3.33 each', popular: true },
            { quantity: 5, totalPriceLabel: '$14.99', subtitle: '≈ $3.00 each' },
          ]}
          defaultSelectedQuantity={3}
          confirmVerb="Buy"
          unitLabel="boosts"
          onClose={() => setShowBoostPackPicker(false)}
          onPurchase={async (qty) => {
            await purchaseConsumable('boost', qty);
            await refreshConsumables();
            setShowBoostPackPicker(false);
            Alert.alert('Purchased', `Added ${qty} boosts.`);
          }}
          secondaryCta={{ label: 'Upgrade to Plus', onPress: () => router.push('/(tabs)/account/plus') }}
        />
      )}

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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
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
  pillRow: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(31, 41, 55, 0.06)',
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  pillText: {
    fontWeight: '700',
    opacity: 0.85,
  },
  boostActiveCard: {
    marginBottom: Spacing.lg,
    backgroundColor: Colors.primary + '10',
  },
  boostActiveTitle: {
    marginBottom: 2,
  },
  boostActiveSub: {
    opacity: 0.7,
  },
  boostChipsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  boostChip: {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  boostChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  boostChipTitle: {
    fontWeight: '800',
    textAlign: 'center',
  },
  boostChipPrice: {
    fontWeight: '800',
    opacity: 0.85,
  },
  boostChipEach: {
    opacity: 0.65,
  },
  boostPopularTag: {
    position: 'absolute',
    top: -10,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  boostPopularTagText: {
    color: Colors.background,
    fontWeight: '800',
    fontSize: 10,
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
  helperText: {
    opacity: 0.7,
    textAlign: 'center',
  },
  plusUpsellCard: {
    marginBottom: Spacing.xl,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  plusUpsellTitle: {
    marginBottom: Spacing.xs,
  },
  plusUpsellBody: {
    opacity: 0.8,
    marginBottom: Spacing.md,
  },
});

