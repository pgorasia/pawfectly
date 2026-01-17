import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { LaneBadge, type LaneBadgeValue } from '@/components/messages/LaneBadge';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { getLikedYouPage, type LikedYouCard, type LikedYouCursor } from '@/services/feed/likedYouService';
import { useAuth } from '@/contexts/AuthContext';
import { publicPhotoUrl } from '@/utils/photoUrls';
import { useMyEntitlements } from '@/hooks/useMyEntitlements';
import { isEntitlementActive } from '@/services/entitlements/entitlementsService';

type LaneFilter = 'all' | 'pals' | 'match';

export default function LikedYouScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: entitlements, refresh: refreshEntitlements } = useMyEntitlements();

  const [cards, setCards] = useState<LikedYouCard[]>([]);

  const [nextCursor, setNextCursor] = useState<LikedYouCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all');
  const isPremium = isEntitlementActive(entitlements, 'plus');

  // Load initial page
  useEffect(() => {
    if (!user?.id) return;

    const loadInitial = async () => {
      try {
        setLoading(true);
        const likedRes = await getLikedYouPage(20);

        setCards(likedRes.rows);
        setNextCursor(likedRes.nextCursor);
      } catch (error) {
        console.error('[LikedYouScreen] Failed to load initial page:', error);
      } finally {
        setLoading(false);
      }
    };

    loadInitial();
  }, [user?.id]);

  // Refresh when screen comes into focus (e.g., after returning from profile view)
  useFocusEffect(
    useCallback(() => {
      if (!user?.id || loading) return;

      const refreshOnFocus = async () => {
        try {
          await refreshEntitlements();
          const likedRes = await getLikedYouPage(20);
          setCards(likedRes.rows);
          setNextCursor(likedRes.nextCursor);
        } catch (error) {
          console.error('[LikedYouScreen] Failed to refresh on focus:', error);
        }
      };

      refreshOnFocus();
    }, [user?.id, loading, refreshEntitlements])
  );

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const likedRes = await getLikedYouPage(20);
      setCards(likedRes.rows);
      setNextCursor(likedRes.nextCursor);
    } catch (error) {
      console.error('[LikedYouScreen] Failed to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Load more handler
  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const { rows, nextCursor: cursor } = await getLikedYouPage(20, nextCursor);
      setCards((prev) => [...prev, ...rows]);
      setNextCursor(cursor);
    } catch (error) {
      console.error('[LikedYouScreen] Failed to load more:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // Cross-lane pending is now surfaced in Messages > Matches; keep this screen strictly for inbound likes.
  const normalCards = useMemo(() => cards.filter((c) => !c.requires_lane_choice), [cards]);

  // Filter cards by lane (only applies to non-pending cards)
  const filteredCards = useMemo(() => {
    if (laneFilter === 'all') return normalCards;
    return normalCards.filter((card) => card.lane === laneFilter);
  }, [normalCards, laneFilter]);

  // Handle card press
  const handleCardPress = useCallback((card: LikedYouCard) => {
    if (!isPremium) {
      Alert.alert(
        'Upgrade to Pawfectly+',
        'Unlock Who Liked You to view profiles.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/(tabs)/account/plus') },
        ]
      );
      return;
    }

    // Navigate to profile view
    router.push({
      pathname: '/profile/[id]',
      params: { id: card.liker_id, source: 'liked-you' },
    });
  }, [isPremium, router]);

  /**
   * Segmented control for lane filter
   */
  const renderLaneFilter = () => (
    <View style={styles.laneFilterContainer}>
      <TouchableOpacity
        style={[styles.laneFilterButton, laneFilter === 'all' && styles.laneFilterButtonActive]}
        onPress={() => setLaneFilter('all')}
        activeOpacity={0.7}
      >
        <AppText
          variant="body"
          style={[styles.laneFilterText, laneFilter === 'all' && styles.laneFilterTextActive]}
        >
          All
        </AppText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.laneFilterButton, laneFilter === 'pals' && styles.laneFilterButtonActive]}
        onPress={() => setLaneFilter('pals')}
        activeOpacity={0.7}
      >
        <AppText
          variant="body"
          style={[styles.laneFilterText, laneFilter === 'pals' && styles.laneFilterTextActive]}
        >
          Pals
        </AppText>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.laneFilterButton, laneFilter === 'match' && styles.laneFilterButtonActive]}
        onPress={() => setLaneFilter('match')}
        activeOpacity={0.7}
      >
        <AppText
          variant="body"
          style={[styles.laneFilterText, laneFilter === 'match' && styles.laneFilterTextActive]}
        >
          Match
        </AppText>
      </TouchableOpacity>
    </View>
  );

  // Render card
  const renderCard = useCallback(({ item }: { item: LikedYouCard }) => {
    const photoUrl = publicPhotoUrl(item.hero_photo_storage_path);
    const displayText = [item.dog_name, item.display_name, item.city].filter(Boolean).join(' • ');
    const badgeLane = (item.badge_lane ?? item.lane) as LaneBadgeValue;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.9}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.cardImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[styles.cardImage, styles.placeholderImage]}>
            <AppText variant="heading" style={styles.placeholderText}>
              {item.dog_name?.[0] || item.display_name?.[0] || '?'}
            </AppText>
          </View>
        )}

        {!isPremium && !item.requires_lane_choice ? <View style={styles.blurOverlay} /> : null}

        <View style={styles.badgeContainer}>
          <LaneBadge lane={badgeLane} />
        </View>

        <View style={styles.cardInfo}>
          <AppText variant="body" style={styles.cardText} numberOfLines={2}>
            {displayText}
          </AppText>
        </View>
      </TouchableOpacity>
    );
  }, [isPremium, handleCardPress]);

  // Render header
  const renderHeader = useCallback(() => {
    const showPremiumBanner = !isPremium && normalCards.length > 0;

    if (!showPremiumBanner) return null;

    return (
      <View>
        {showPremiumBanner ? (
          <View style={styles.premiumBanner}>
            <AppText variant="heading" style={styles.premiumTitle}>
              {normalCards.length} {normalCards.length === 1 ? 'person wants' : 'people want'} to connect with you
            </AppText>
            <AppText variant="body" style={styles.premiumSubtitle}>
              Upgrade to Pawfectly+ to unlock.
            </AppText>
            <AppButton
              variant="primary"
              onPress={() => router.push('/(tabs)/account/plus')}
              style={styles.premiumButton}
            >
              Upgrade to Pawfectly+
            </AppButton>
          </View>
        ) : null}
      </View>
    );
  }, [isPremium, normalCards.length, router]);

  // Render footer (loading more indicator)
  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }, [loadingMore]);

  // Render empty state
  const renderEmpty = useCallback(() => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <AppText variant="heading" style={styles.emptyTitle}>
          No Likes Yet
        </AppText>
        <AppText variant="body" style={styles.emptyText}>
          When people like you, they'll appear here
        </AppText>
      </View>
    );
  }, [loading]);

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <AppText variant="body" style={styles.loadingText}>
            Loading likes...
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {/* Lane Filter */}
      {renderLaneFilter()}

      <FlatList<LikedYouCard>
        data={filteredCards}
        renderItem={renderCard}
        keyExtractor={(item) => item.liker_id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      />

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    opacity: 0.7,
  },
  // Lane filter
  laneFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  laneFilterButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 20,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneFilterButtonActive: {
    backgroundColor: Colors.primary,
  },
  laneFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    opacity: 0.7,
  },
  laneFilterTextActive: {
    color: Colors.background,
    opacity: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
  },
  premiumBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.xl,
    marginHorizontal: Spacing.xs,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  premiumTitle: {
    color: Colors.background,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  premiumSubtitle: {
    color: Colors.background,
    opacity: 0.9,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  premiumButton: {
    minWidth: 200,
  },
  card: {
    flex: 1,
    maxWidth: '48%',
    aspectRatio: 0.75,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    marginBottom: Spacing.md,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  badgeContainer: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 2,
    zIndex: 2,
  },
  placeholderImage: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.background,
    fontSize: 32,
  },
  cardInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  cardText: {
    color: Colors.background,
    fontWeight: '600',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    zIndex: 1,
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  emptyText: {
    opacity: 0.7,
    textAlign: 'center',
  },
});
