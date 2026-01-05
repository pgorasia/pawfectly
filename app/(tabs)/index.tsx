import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Card } from '@/components/ui/Card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { getFeedBasic, submitSwipe, undoSwipe, undoPassSwipe, buildHeroPhotoUrl, type FeedBasicCandidate, type SubmitSwipeResult } from '@/services/feed/feedService';
import { blockUser } from '@/services/block/blockService';

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<FeedBasicCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [remainingAccepts, setRemainingAccepts] = useState<number | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumModalCard, setPremiumModalCard] = useState<FeedBasicCandidate | null>(null);
  
  // Undo functionality
  const [lastSwipe, setLastSwipe] = useState<{
    candidate: FeedBasicCandidate;
    action: 'reject' | 'pass';
  } | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);

  const loadFeed = useCallback(async () => {
    if (!user?.id) return;

    try {
      const feedCandidates = await getFeedBasic(user.id, 20);
      setCandidates(feedCandidates);
    } catch (error) {
      console.error('[FeedScreen] Failed to load feed:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed();
  }, [loadFeed]);

  const handleSwipe = useCallback(async (action: 'reject' | 'pass' | 'accept') => {
    if (!user?.id || candidates.length === 0 || swiping) return;

    const currentCandidate = candidates[0];
    setSwiping(true);

    try {
      const result: SubmitSwipeResult = await submitSwipe(user.id, currentCandidate.candidate_id, action);

      if (result.ok) {
        // Update remaining accepts if provided
        if (result.remaining_accepts !== undefined) {
          setRemainingAccepts(result.remaining_accepts);
        }

        // Store last swipe for undo (only for reject/pass)
        if (action === 'reject' || action === 'pass') {
          setLastSwipe({
            candidate: currentCandidate,
            action,
          });
        }

        // Remove the card from the list
        setCandidates(prev => prev.slice(1));

        // Refetch if remaining cards < 5
        if (candidates.length - 1 < 5) {
          loadFeed();
        }
      } else if (result.error === 'daily_limit_reached') {
        // Show premium upgrade modal (Dil Mil style - card stays in background)
        setPremiumModalCard(currentCandidate);
        setShowPremiumModal(true);
        // Keep the card in the list - don't remove it
      }
    } catch (error) {
      console.error('[FeedScreen] Failed to submit swipe:', error);
    } finally {
      setSwiping(false);
    }
  }, [user?.id, candidates, swiping, loadFeed]);

  const handleUndo = useCallback(async () => {
    if (!lastSwipe || !user?.id) return;

    try {
      let undoneCandidateId: string | null = null;

      // For pass swipes, delete the pass swipe record so it can appear in feed again
      if (lastSwipe.action === 'pass') {
        undoneCandidateId = await undoPassSwipe();
      } else {
        // For reject swipes, call the RPC to delete the swipe record
        undoneCandidateId = await undoSwipe();
      }
      
      // Add the last swiped candidate back to the top of the list
      if (undoneCandidateId) {
        setCandidates(prev => [lastSwipe.candidate, ...prev]);
        setLastSwipe(null);
      } else {
        // If nothing was undone, still add it back (shouldn't normally happen)
        setCandidates(prev => [lastSwipe.candidate, ...prev]);
        setLastSwipe(null);
      }
    } catch (error) {
      console.error('[FeedScreen] Failed to undo swipe:', error);
      // Still add it back to the list even if DB undo fails
      setCandidates(prev => [lastSwipe.candidate, ...prev]);
      setLastSwipe(null);
    }
  }, [lastSwipe, user?.id]);

  const handleBlock = useCallback(async (reason: 'block' | 'report', candidateId: string, humanName: string | null) => {
    if (!user?.id) return;

    const actionText = reason === 'block' ? 'block' : 'report';
    const confirmText = reason === 'block' 
      ? `Are you sure you want to block ${humanName || 'this user'}? They won't appear in your feed anymore.`
      : `Are you sure you want to report ${humanName || 'this user'}? This action cannot be undone.`;

    Alert.alert(
      `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} User`,
      confirmText,
      [
        {
          text: actionText.charAt(0).toUpperCase() + actionText.slice(1),
          style: reason === 'report' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await blockUser(user.id, candidateId, reason);
              // Remove from candidates and reload feed
              setCandidates(prev => prev.slice(1));
              if (candidates.length - 1 < 5) {
                loadFeed();
              }
              setShowBlockMenu(false);
            } catch (error) {
              console.error('[FeedScreen] Failed to block user:', error);
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [user?.id, candidates.length, loadFeed]);

  // Auto-refetch when remaining cards < 5
  useEffect(() => {
    if (candidates.length > 0 && candidates.length < 5 && !loading && !refreshing) {
      loadFeed();
    }
  }, [candidates.length, loading, refreshing, loadFeed]);

  const handleClosePremiumModal = () => {
    setShowPremiumModal(false);
    setPremiumModalCard(null);
  };

  const handleUpgrade = () => {
    // TODO: Navigate to premium upgrade screen
    handleClosePremiumModal();
    // For now, just close the modal
    console.log('[FeedScreen] Premium upgrade clicked');
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <AppText variant="body" style={styles.loadingText}>
            Loading feed...
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  const currentCard = candidates[0];
  const hasCards = candidates.length > 0;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="heading" style={styles.appName}>
          Pawfectly
        </AppText>
        <View style={styles.headerRight}>
          {lastSwipe && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleUndo}
            >
              <MaterialIcons name="undo" size={24} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(profile)/preferences')}
          >
            <IconSymbol name="slider.horizontal.3" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {hasCards ? (
          <View style={styles.cardContainer}>
            <Card style={styles.card}>
              {/* Hero Image */}
              {(() => {
                // Debug: Log the card data to see what we have
                if (__DEV__) {
                  console.log('[FeedScreen] Card hero photo data:', {
                    bucketType: currentCard.heroPhotoBucketType,
                    storagePath: currentCard.heroPhotoStoragePath,
                    photoId: currentCard.heroPhotoId,
                  });
                }
                
                const heroImageUrl = buildHeroPhotoUrl(
                  currentCard.heroPhotoBucketType,
                  currentCard.heroPhotoStoragePath
                );
                
                if (__DEV__) {
                  console.log('[FeedScreen] Hero image URL:', heroImageUrl);
                }
                
                return heroImageUrl ? (
                  <Image
                    source={{ uri: heroImageUrl }}
                    style={styles.heroImage}
                    cachePolicy="disk"
                    contentFit="cover"
                    onError={(error) => {
                      console.error('[FeedScreen] Image load error:', error);
                    }}
                    onLoad={() => {
                      if (__DEV__) {
                        console.log('[FeedScreen] Image loaded successfully');
                      }
                    }}
                  />
                ) : (
                  <View style={styles.heroImagePlaceholder}>
                    <AppText variant="body" style={styles.placeholderText}>
                      Photos under review
                    </AppText>
                    {__DEV__ && (
                      <AppText variant="caption" style={[styles.placeholderText, { fontSize: 10, marginTop: 4 }]}>
                        Debug: bucket={currentCard.heroPhotoBucketType || 'null'}, path={currentCard.heroPhotoStoragePath ? 'exists' : 'null'}
                      </AppText>
                    )}
                  </View>
                );
              })()}
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderSpacer} />
                  <TouchableOpacity
                    style={styles.moreButton}
                    onPress={() => setShowBlockMenu(true)}
                  >
                    <MaterialIcons name="more-vert" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>
                <AppText variant="heading" style={styles.dogName}>
                  {currentCard.dog_name || 'No dog name'}
                </AppText>
                <AppText variant="body" style={styles.humanName}>
                  {currentCard.human_name || 'No name'}
                </AppText>
                {currentCard.city && (
                  <AppText variant="caption" style={styles.city}>
                    📍 {currentCard.city}
                  </AppText>
                )}
              </View>
            </Card>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.swipeButton, styles.rejectButton]}
                onPress={() => handleSwipe('reject')}
                disabled={swiping}
                activeOpacity={0.7}
              >
                <IconSymbol name="xmark.circle.fill" size={32} color={Colors.error} />
                <AppText variant="caption" style={styles.buttonLabel}>
                  Reject
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.swipeButton, styles.passButton]}
                onPress={() => handleSwipe('pass')}
                disabled={swiping}
                activeOpacity={0.7}
              >
                <IconSymbol name="clock.fill" size={32} color={Colors.text} />
                <AppText variant="caption" style={styles.buttonLabel}>
                  Pass
                </AppText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.swipeButton, styles.acceptButton]}
                onPress={() => handleSwipe('accept')}
                disabled={swiping || (remainingAccepts !== null && remainingAccepts <= 0)}
                activeOpacity={0.7}
              >
                {swiping ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  <>
                    <IconSymbol name="heart.fill" size={32} color={Colors.background} />
                    <AppText variant="caption" style={styles.acceptButtonLabel}>
                      Accept
                    </AppText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <AppText variant="heading" style={styles.emptyTitle}>
              No more profiles
            </AppText>
            <AppText variant="body" style={styles.emptySubtitle}>
              Check back later for more potential connections!
            </AppText>
          </View>
        )}
      </ScrollView>

      {/* Block/Report Menu Modal */}
      <Modal
        visible={showBlockMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBlockMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowBlockMenu(false)}
        >
          <View style={styles.blockMenuContent}>
            <TouchableOpacity
              style={styles.blockMenuItem}
              onPress={() => {
                if (currentCard) {
                  handleBlock('block', currentCard.candidate_id, currentCard.human_name);
                }
              }}
            >
              <MaterialIcons name="block" size={24} color={Colors.text} />
              <AppText variant="body" style={styles.blockMenuText}>
                Block User
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.blockMenuItem}
              onPress={() => {
                if (currentCard) {
                  handleBlock('report', currentCard.candidate_id, currentCard.human_name);
                }
              }}
            >
              <MaterialIcons name="report" size={24} color={Colors.error} />
              <AppText variant="body" style={[styles.blockMenuText, { color: Colors.error }]}>
                Report User
              </AppText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Premium Upgrade Modal (Dil Mil style) */}
      <Modal
        visible={showPremiumModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleClosePremiumModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <AppText variant="heading" style={styles.modalTitle}>
              Daily Limit Reached
            </AppText>
            <AppText variant="body" style={styles.modalText}>
              You've used all your free likes for today. Upgrade to Premium for unlimited likes!
            </AppText>
            <View style={styles.modalButtons}>
              <AppButton
                variant="ghost"
                style={styles.modalButton}
                onPress={handleClosePremiumModal}
              >
                Maybe Later
              </AppButton>
              <AppButton
                variant="primary"
                style={styles.modalButton}
                onPress={handleUpgrade}
              >
                Upgrade Now
              </AppButton>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
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
    gap: Spacing.sm,
    alignItems: 'center',
  },
  headerButton: {
    padding: Spacing.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    marginTop: Spacing.md,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  card: {
    minHeight: 400,
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: 360,
    borderRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  heroImagePlaceholder: {
    width: '100%',
    height: 360,
    backgroundColor: Colors.text + '20',
    borderRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.text,
    opacity: 0.6,
    textAlign: 'center',
  },
  cardContent: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  cardHeader: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  cardHeaderSpacer: {
    flex: 1,
  },
  moreButton: {
    padding: Spacing.xs,
  },
  dogName: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  humanName: {
    fontSize: 24,
    textAlign: 'center',
    opacity: 0.8,
  },
  city: {
    textAlign: 'center',
    opacity: 0.6,
    marginTop: Spacing.sm,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  swipeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: 12,
    minHeight: 80,
    gap: Spacing.xs,
  },
  rejectButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.error,
  },
  passButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.text,
  },
  acceptButton: {
    backgroundColor: Colors.primary,
  },
  buttonLabel: {
    marginTop: Spacing.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  acceptButtonLabel: {
    marginTop: Spacing.xs,
    fontWeight: '600',
    color: Colors.background,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: 16,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  modalText: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
    opacity: 0.8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
  },
  blockMenuContent: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: Spacing.sm,
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  blockMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  blockMenuText: {
    flex: 1,
  },
});
