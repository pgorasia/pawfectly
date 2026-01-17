import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useMe } from '@/contexts/MeContext';
import { usePhotoBuckets } from '@/hooks/usePhotoBuckets';
import { setProfileHidden } from '@/services/profile/statusRepository';
import { supabase } from '@/services/supabase/supabaseClient';
import { publicPhotoUrl } from '@/utils/photoUrls';
import { useMyConsumables } from '@/hooks/useMyConsumables';
import { MyBadgesInline } from '@/components/account/MyBadges';
import { useMyEntitlements } from '@/hooks/useMyEntitlements';
import { isEntitlementActive } from '@/services/entitlements/entitlementsService';
import { useMySubscription } from '@/hooks/useMySubscription';

type AccountHomeTab = 'upgrades' | 'trust_safety';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || 'https://example.com/terms';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://example.com/privacy';

const INSTAGRAM_STORY_GRADIENT = ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'];

function formatDaysUntilRenewal(days: number) {
  if (days === 1) return 'Renews in 1 day';
  return `Renews in ${days} days`;
}

function daysUntil(isoTs: string | null) {
  if (!isoTs) return null;
  const now = Date.now();
  const ts = new Date(isoTs).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffMs = Math.max(0, ts - now);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

async function openLegalUrl(url: string | undefined, title: string) {
  if (!url) {
    Alert.alert(title, 'This link is not configured yet.');
    return;
  }

  await openBrowserAsync(url, {
    presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
  });
}

function SectionTitle({ title }: { title: string }) {
  return (
    <AppText variant="caption" style={styles.sectionTitle}>
      {title.toUpperCase()}
    </AppText>
  );
}

function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  disabled,
  showChevron = true,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  showChevron?: boolean;
}) {
  const isPressable = !!onPress;
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={!!disabled}
      activeOpacity={isPressable ? 0.75 : 1}
    >
      <View style={styles.rowLeft}>
        {left}
        <View style={styles.rowText}>
          <AppText variant="body" style={styles.rowTitle}>
            {title}
          </AppText>
          {!!subtitle && (
            <AppText variant="caption" style={styles.rowSubtitle}>
              {subtitle}
            </AppText>
          )}
        </View>
      </View>
      <View style={styles.rowRight}>
        {right}
        {isPressable && showChevron && (
          <AppText variant="body" style={styles.rowChevron}>
            →
          </AppText>
        )}
      </View>
    </TouchableOpacity>
  );
}

function ConsumableBadge({ count }: { count: number }) {
  return (
    <View style={styles.countBadge}>
      <AppText variant="caption" style={styles.countBadgeText}>
        {count}
      </AppText>
    </View>
  );
}

function UpgradesTab() {
  const router = useRouter();
  const { byType, refresh: refreshConsumables } = useMyConsumables();
  const { data: entitlements, refresh: refreshEntitlements } = useMyEntitlements();
  const { data: subscription, refresh: refreshSubscription } = useMySubscription();

  const isPlus = isEntitlementActive(entitlements, 'plus');
  const renewalLabel = useMemo(() => {
    if (!subscription) return null;
    if (subscription.status !== 'active') return null;
    const ts = new Date(subscription.current_period_end).getTime();
    if (!Number.isFinite(ts)) return null;
    const dateLabel = new Date(ts).toLocaleDateString();
    if (subscription.cancel_at_period_end || !subscription.auto_renews) return `Ends ${dateLabel}`;
    return `Renews ${dateLabel}`;
  }, [subscription]);

  // Fix: When returning from the Plus purchase flow, this tab stays mounted.
  // Refresh server-state on focus so the UI reflects the upgrade immediately.
  useFocusEffect(
    useCallback(() => {
      Promise.allSettled([refreshEntitlements(), refreshSubscription(), refreshConsumables()]).catch(() => {});
    }, [refreshConsumables, refreshEntitlements, refreshSubscription])
  );

  const consumables = [
    {
      key: 'boost',
      title: 'Boost',
      subtitle: `Get more profile views.`,
      renewText: (() => {
        if (!isPlus) return '';
        const row = byType('boost');
        const d = daysUntil(row?.renews_at ?? null);
        return d !== null ? formatDaysUntilRenewal(d) : '';
      })(),
      count: byType('boost')?.balance ?? 0,
      icon: <IconSymbol name="bolt.fill" size={18} color={Colors.primary} />,
    },
    {
      key: 'rewind',
      title: 'Rewind',
      subtitle: `Undo your last pass.`,
      renewText: (() => {
        if (!isPlus) return '';
        const row = byType('rewind');
        const d = daysUntil(row?.renews_at ?? null);
        return d !== null ? formatDaysUntilRenewal(d) : '';
      })(),
      count: byType('rewind')?.balance ?? 0,
      icon: <IconSymbol name="arrow.uturn.backward" size={18} color={Colors.primary} />,
    },
    {
      key: 'compliment',
      title: 'Compliment',
      subtitle: `Send a message with your like.`,
      renewText: (() => {
        if (!isPlus) return '';
        const row = byType('compliment');
        const d = daysUntil(row?.renews_at ?? null);
        return d !== null ? formatDaysUntilRenewal(d) : '';
      })(),
      count: byType('compliment')?.balance ?? 0,
      icon: <IconSymbol name="sparkles" size={18} color={Colors.primary} />,
    },
    {
      key: 'reset-dislikes',
      title: 'Reset passes/skips',
      subtitle: `See profiles you passed or skipped again.`,
      renewText: (() => {
        if (!isPlus) return 'Pay per use';
        const row = byType('reset_dislikes');
        const d = daysUntil(row?.renews_at ?? null);
        if (d !== null) return formatDaysUntilRenewal(d);
        return 'Pay per use';
      })(),
      count: byType('reset_dislikes')?.balance ?? 0,
      icon: <IconSymbol name="arrow.counterclockwise" size={18} color={Colors.primary} />,
    },
  ] as const;

  return (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {isPlus ? (
        <Card style={styles.plusCard}>
          <View style={styles.plusCardHeader}>
            <AppText variant="heading" style={styles.plusTitle}>
              Manage subscription
            </AppText>
            <AppText variant="body" style={styles.plusSubtitle}>
              {renewalLabel ? `${renewalLabel}.` : 'Pawfectly+ is active.'} Renews automatically. Cancel anytime in
              Settings.
            </AppText>
          </View>
          <AppButton variant="primary" onPress={() => router.push('/(tabs)/account/settings/subscription')}>
            Manage
          </AppButton>
        </Card>
      ) : (
        <Card style={styles.plusCard}>
          <View style={styles.plusCardHeader}>
            <AppText variant="heading" style={styles.plusTitle}>
              Get more with Pawfectly +
            </AppText>
            <AppText variant="body" style={styles.plusSubtitle}>
              Unlock premium features and get more quality matches.
            </AppText>
          </View>
          <AppButton variant="primary" onPress={() => router.push('/(tabs)/account/plus')}>
            Upgrade
          </AppButton>
        </Card>
      )}

      <View style={styles.sectionGroup}>
        {consumables
          .filter((c) => (isPlus ? c.key !== 'rewind' : true))
          .map((c) => (
            <Row
              key={c.key}
              title={c.title}
              subtitle={`${c.subtitle} ${c.renewText ? `• ${c.renewText}` : ''}`}
              left={
                <View style={styles.rowIconWrap}>
                  {c.icon}
                  <View style={styles.rowIconBadge}>
                    <ConsumableBadge count={c.count} />
                  </View>
                </View>
              }
              onPress={() => {
                // Keep rows enabled. If you still have uses left, nudge instead of selling more.
                if (c.key !== 'reset-dislikes' && c.count > 0) {
                  Alert.alert(
                    'You’re not out yet',
                    `You have ${c.count} left. You can purchase more once you’re out.`
                  );
                  return;
                }
                router.push(`/(tabs)/account/consumables/${c.key}`);
              }}
            />
          ))}
      </View>
    </ScrollView>
  );
}

function TrustAndSafetyTab() {
  const router = useRouter();
  const [hideProfile, setHideProfileState] = useState(false);
  const [loadingHideProfile, setLoadingHideProfile] = useState(true);

  useEffect(() => {
    const loadProfileHidden = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const userId = session.session?.user?.id;
        if (!userId) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('is_hidden')
          .eq('user_id', userId)
          .single();

        if (error) {
          console.error('[TrustAndSafetyTab] Failed to load profile hidden status:', error);
        } else {
          setHideProfileState(data?.is_hidden ?? false);
        }
      } catch (error) {
        console.error('[TrustAndSafetyTab] Error loading profile hidden status:', error);
      } finally {
        setLoadingHideProfile(false);
      }
    };

    loadProfileHidden();
  }, []);

  const handleToggleHideProfile = async (value: boolean) => {
    setHideProfileState(value);
    try {
      await setProfileHidden(value);
    } catch (error) {
      setHideProfileState(!value);
      Alert.alert('Error', 'Failed to update profile visibility. Please try again.');
    }
  };

  return (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <SectionTitle title="Trust" />
      <View style={styles.sectionGroup}>
        <MyBadgesInline />
      </View>

      <SectionTitle title="Safety" />
      <View style={styles.sectionGroup}>
        <Row
          title="Hide my profile"
          subtitle="Hide your profile from being shown to others"
          left={<IconSymbol name="eye.slash" size={18} color={Colors.primary} />}
          right={
            <Switch
              value={hideProfile}
              onValueChange={handleToggleHideProfile}
              disabled={loadingHideProfile}
            />
          }
          showChevron={false}
        />
        <Row
          title="Blocked users"
          subtitle="View and manage blocked users"
          left={<IconSymbol name="hand.raised.fill" size={18} color={Colors.primary} />}
          onPress={() => router.push('/(tabs)/account/blocked-users')}
        />
      </View>

      <SectionTitle title="Legal" />
      <View style={styles.sectionGroup}>
        <Row
          title="Terms"
          left={<IconSymbol name="doc.text" size={18} color={Colors.primary} />}
          onPress={() => {
            openLegalUrl(TERMS_URL, 'Terms').catch((e) => console.error('[Legal] Failed to open Terms:', e));
          }}
        />
        <Row
          title="Privacy policy"
          left={<IconSymbol name="hand.raised" size={18} color={Colors.primary} />}
          onPress={() => {
            openLegalUrl(PRIVACY_URL, 'Privacy policy').catch((e) =>
              console.error('[Legal] Failed to open Privacy policy:', e)
            );
          }}
        />
      </View>
    </ScrollView>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { me, meLoaded, refreshBadges } = useMe();
  const [activeTab, setActiveTab] = useState<AccountHomeTab>('upgrades');
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);

  useEffect(() => {
    if (params.tab === 'trust_safety' || params.tab === 'upgrades') {
      setActiveTab(params.tab);
    }
  }, [params.tab]);

  const dogSlots = useMemo(() => {
    return me.dogs.map((d) => d.slot).filter((slot) => slot >= 1 && slot <= 3);
  }, [me.dogs]);

  const { humanBucket } = usePhotoBuckets(dogSlots);

  const avatarUrl = useMemo(() => {
    const firstHumanPhoto = humanBucket.photos?.[0];
    return publicPhotoUrl(firstHumanPhoto?.storage_path);
  }, [humanBucket.photos]);

  const firstName = useMemo(() => {
    const displayName = me.profile?.display_name || '';
    const trimmed = displayName.trim();
    if (!trimmed) return 'You';
    return trimmed.split(' ')[0] || trimmed;
  }, [me.profile?.display_name]);

  const photoWithDogVerified = useMemo(() => {
    return Boolean((me.badges || []).find((b: any) => b.type === 'photo_with_dog' && b.earned));
  }, [me.badges]);

  const selfieVerified = useMemo(() => {
    return Boolean((me.badges || []).find((b: any) => b.type === 'selfie_verified' && b.earned));
  }, [me.badges]);

  const verification = useMemo(() => {
    const both = photoWithDogVerified && selfieVerified;
    const label = both
      ? 'Photo + Selfie verified'
      : photoWithDogVerified
        ? 'Photo verified'
        : selfieVerified
          ? 'Selfie verified'
          : null;

    const color = both
      ? '#F59E0B'
      : photoWithDogVerified
        ? '#3B82F6'
        : selfieVerified
          ? '#14B8A6'
          : null;

    return { label, color };
  }, [photoWithDogVerified, selfieVerified]);

  // Ensure badges are available for verification UI (MeContext is cached; refresh only if missing).
  useEffect(() => {
    if (meLoaded && (!me.badges || me.badges.length === 0)) {
      refreshBadges().catch((e) => console.error('[AccountScreen] refreshBadges failed:', e));
    }
  }, [meLoaded, me.badges, refreshBadges]);

  const verificationIconColor = verification.color || Colors.primary;

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.headerTop}>
        <AppText variant="heading" style={styles.appName}>
          Pawfectly
        </AppText>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/preferences?from=account')}
          >
            <IconSymbol name="slider.horizontal.3" size={24} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/account/settings')}
          >
            <IconSymbol name="gearshape.fill" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.profileHeader}>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/account/profile')}
          activeOpacity={0.85}
          style={styles.avatarButton}
        >
          <View style={styles.avatarOuter}>
            <LinearGradient
              colors={INSTAGRAM_STORY_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <IconSymbol name="person.fill" size={30} color={Colors.text + '80'} />
                  </View>
                )}
              </View>
            </LinearGradient>

            <View style={styles.avatarEditBadge}>
              <MaterialIcons name="edit" size={18} color={Colors.background} />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.nameRow}>
          <AppText variant="heading" style={styles.nameText}>
            {firstName}
          </AppText>
          {!!verification.label && !!verification.color && (
            <TouchableOpacity
              onPress={() => setVerificationModalOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.85}
            >
              <MaterialIcons name="verified" size={20} color={verificationIconColor} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upgrades' && styles.tabActive]}
          onPress={() => setActiveTab('upgrades')}
        >
          <AppText
            variant="body"
            style={[styles.tabText, activeTab === 'upgrades' && styles.tabTextActive]}
          >
            Upgrades
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'trust_safety' && styles.tabActive]}
          onPress={() => setActiveTab('trust_safety')}
        >
          <AppText
            variant="body"
            style={[styles.tabText, activeTab === 'trust_safety' && styles.tabTextActive]}
          >
            Trust & Safety
          </AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {activeTab === 'upgrades' ? <UpgradesTab /> : <TrustAndSafetyTab />}
      </View>

      <Modal
        visible={verificationModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVerificationModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setVerificationModalOpen(false)}
        >
          <View style={styles.tooltipCard}>
            <AppText variant="body" style={styles.tooltipText}>
              {verification.label || ''}
            </AppText>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  appName: {
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  profileHeader: {
    alignItems: 'center',
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  avatarButton: {
    paddingVertical: Spacing.xs,
  },
  avatarOuter: {
    width: 92,
    height: 92,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    padding: 4,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 42,
    overflow: 'hidden',
    backgroundColor: Colors.background,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(31, 41, 55, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  nameText: {
    fontWeight: '700',
    fontSize: 18,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    opacity: 0.5,
  },
  tabTextActive: {
    opacity: 1,
    fontWeight: '600',
    color: Colors.primary,
  },
  tabContainer: {
    flex: 1,
  },
  tabScroll: {
    flex: 1,
  },
  tabScrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  plusCard: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  plusCardHeader: {
    marginBottom: Spacing.md,
  },
  plusTitle: {
    marginBottom: Spacing.xs,
  },
  plusSubtitle: {
    opacity: 0.8,
  },
  sectionTitle: {
    opacity: 0.6,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionGroup: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 12,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontWeight: '600',
    marginBottom: 2,
  },
  rowSubtitle: {
    opacity: 0.7,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowChevron: {
    opacity: 0.5,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowIconBadge: {
    position: 'absolute',
    right: -6,
    top: -6,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countBadgeText: {
    color: Colors.background,
    fontWeight: '700',
    fontSize: 10,
  },
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  tooltipCard: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    maxWidth: 320,
  },
  tooltipText: {
    fontWeight: '600',
  },
});

