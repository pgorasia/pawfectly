import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { 
  getLikedYouPage, 
  type LikedYouCard, 
  type LikedYouCursor 
} from '@/services/feed/likedYouService';
import { useAuth } from '@/contexts/AuthContext';
import { publicPhotoUrl } from '@/utils/photoUrls';

export default function LikedYouScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [cards, setCards] = useState<LikedYouCard[]>([]);
  const [nextCursor, setNextCursor] = useState<LikedYouCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isPremium, setIsPremium] = useState(false); // TODO: Get from user subscription status

  // Load initial page
  useEffect(() => {
    if (!user?.id) return;
    
    const loadInitial = async () => {
      try {
        setLoading(true);
        const { rows, nextCursor: cursor } = await getLikedYouPage(20);
        setCards(rows);
        setNextCursor(cursor);
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
      
      // Silently refresh in background
      const refreshOnFocus = async () => {
        try {
          const { rows, nextCursor: cursor } = await getLikedYouPage(20);
          setCards(rows);
          setNextCursor(cursor);
        } catch (error) {
          console.error('[LikedYouScreen] Failed to refresh on focus:', error);
        }
      };

      refreshOnFocus();
    }, [user?.id, loading])
  );

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { rows, nextCursor: cursor } = await getLikedYouPage(20);
      setCards(rows);
      setNextCursor(cursor);
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

  // Handle card press
  const handleCardPress = useCallback((card: LikedYouCard) => {
    if (!isPremium) {
      // TODO: Show premium upgrade modal
      console.log('Premium required to view profile');
      return;
    }
    
    // Navigate to profile view
    router.push({
      pathname: '/profile/[id]',
      params: { id: card.liker_id, source: 'liked-you' },
    });
  }, [isPremium, router]);

  // Render card
  const renderCard = useCallback(({ item }: { item: LikedYouCard }) => {
    const photoUrl = publicPhotoUrl(item.hero_photo_storage_path);
    const displayText = [item.dog_name, item.display_name, item.city]
      .filter(Boolean)
      .join(' • ');

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.9}
      >
        {isPremium ? (
          <>
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
            <View style={styles.cardInfo}>
              <AppText variant="body" style={styles.cardText} numberOfLines={2}>
                {displayText}
              </AppText>
            </View>
          </>
        ) : (
          <>
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
            <View style={styles.blurOverlay} />
            <View style={styles.cardInfo}>
              <AppText variant="body" style={styles.cardText} numberOfLines={2}>
                {displayText}
              </AppText>
            </View>
          </>
        )}
      </TouchableOpacity>
    );
  }, [isPremium, handleCardPress]);

  // Render header
  const renderHeader = useCallback(() => {
    if (isPremium || cards.length === 0) return null;

    return (
      <View style={styles.premiumBanner}>
        <AppText variant="heading" style={styles.premiumTitle}>
          Unlock Who Liked You
        </AppText>
        <AppText variant="body" style={styles.premiumSubtitle}>
          {cards.length} {cards.length === 1 ? 'person has' : 'people have'} liked you
        </AppText>
        <AppButton
          variant="primary"
          onPress={() => setIsPremium(true)} // TODO: Navigate to subscription screen
          style={styles.premiumButton}
        >
          Upgrade to Premium
        </AppButton>
      </View>
    );
  }, [isPremium, cards.length]);

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
      <FlatList<LikedYouCard>
        data={cards}
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
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

