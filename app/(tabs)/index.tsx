import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { 
  getFeedQueue, 
  getProfileView, 
  submitSwipe, 
  sendConnectionRequest,
  undoSwipe,
  undoPassSwipe,
  type FeedCursor 
} from '@/services/feed/feedService';
import { blockUser } from '@/services/block/blockService';
import { setProfileHidden } from '@/services/profile/statusRepository';
import { supabase } from '@/services/supabase/supabaseClient';
import { FullProfileView } from '@/components/profile/FullProfileView';
import { LikeComposerModal } from '@/components/profile/LikeComposerModal';
import type { ProfileViewPayload } from '@/types/feed';

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Queue state
  const [queueCandidateIds, setQueueCandidateIds] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<FeedCursor | null>(null);
  const [currentProfile, setCurrentProfile] = useState<ProfileViewPayload | null>(null);
  const [prefetchedProfiles, setPrefetchedProfiles] = useState<Map<string, ProfileViewPayload>>(new Map());
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [swiping, setSwiping] = useState(false);
  const [remainingAccepts, setRemainingAccepts] = useState<number | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [isProfileHidden, setIsProfileHidden] = useState<boolean | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  
  // Like modal state
  const [showLikeModal, setShowLikeModal] = useState(false);
  const [likeSource, setLikeSource] = useState<{ type: 'photo' | 'prompt'; refId: string } | null>(null);
  const [hasScrolledPastHero, setHasScrolledPastHero] = useState(false);
  
  // Undo state
  const [lastAction, setLastAction] = useState<'pass' | 'reject' | null>(null);
  const [lastCandidateId, setLastCandidateId] = useState<string | null>(null);

  // Load initial queue
  const loadFeedQueue = useCallback(async (cursor: FeedCursor | null = null, append: boolean = false) => {
    if (!user?.id) return;

    try {
      const result = await getFeedQueue(10, cursor);
      if (append) {
        setQueueCandidateIds((prev) => [...prev, ...result.candidateIds]);
      } else {
        setQueueCandidateIds(result.candidateIds);
      }
      setNextCursor(result.nextCursor);
    } catch (error) {
      console.error('[FeedScreen] Failed to load feed queue:', error);
    }
  }, [user?.id]);

  // Load profile view
  const loadProfileView = useCallback(async (candidateId: string): Promise<ProfileViewPayload | null> => {
    try {
      const profile = await getProfileView(candidateId);
      return profile;
    } catch (error) {
      console.error('[FeedScreen] Failed to load profile view:', error);
      return null;
    }
  }, []);

  // Prefetch next profiles
  const prefetchNextProfiles = useCallback(async (candidateIds: string[]) => {
    if (candidateIds.length === 0) return;

    const idsToPrefetch = candidateIds.slice(0, 2); // Prefetch next 2
    const prefetchPromises = idsToPrefetch.map(async (id) => {
      const profile = await loadProfileView(id);
      if (profile) {
        return { id, profile };
      }
      return null;
    });

    const results = await Promise.all(prefetchPromises);
    setPrefetchedProfiles((prev) => {
      const newPrefetched = new Map(prev);
      results.forEach((result) => {
        if (result) {
          newPrefetched.set(result.id, result.profile);
        }
      });
      return newPrefetched;
    });
  }, [loadProfileView]);

  // Initialize: load queue and first profile
  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      await loadFeedQueue(null);
      setLoading(false);
    };
    initialize();
  }, [loadFeedQueue]);

  // Load current profile when queue updates
  useEffect(() => {
    const loadCurrent = async () => {
      if (queueCandidateIds.length === 0) {
        setCurrentProfile(null);
        return;
      }

      const currentId = queueCandidateIds[0];
      
      // Check if prefetched
      const prefetched = prefetchedProfiles.get(currentId);
      if (prefetched) {
        setCurrentProfile(prefetched);
        // Remove from prefetched map
        setPrefetchedProfiles((prev) => {
          const newPrefetched = new Map(prev);
          newPrefetched.delete(currentId);
          return newPrefetched;
        });
      } else {
        // Load it
        const profile = await loadProfileView(currentId);
        if (profile) {
          setCurrentProfile(profile);
        }
      }

      // Prefetch next profiles
      if (queueCandidateIds.length > 1) {
        prefetchNextProfiles(queueCandidateIds.slice(1));
      }
    };

    loadCurrent();
  }, [queueCandidateIds, loadProfileView, prefetchNextProfiles]);

  // Load profile hidden status
  useEffect(() => {
    const loadProfileHidden = async () => {
      if (!user?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_hidden')
          .eq('user_id', user.id)
          .single();
        
        if (!error && data) {
          setIsProfileHidden(data.is_hidden ?? false);
        }
      } catch (error) {
        console.error('[FeedScreen] Error loading profile hidden status:', error);
      }
    };

    loadProfileHidden();
  }, [user?.id]);

  const handleUnhideProfile = async () => {
    try {
      await setProfileHidden(false);
      setIsProfileHidden(false);
    } catch (error) {
      console.error('[FeedScreen] Failed to unhide profile:', error);
      Alert.alert('Error', 'Failed to unhide profile. Please try again.');
    }
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeedQueue(null);
    setRefreshing(false);
  }, [loadFeedQueue]);

  // Advance to next profile
  const advanceToNext = useCallback(() => {
    if (queueCandidateIds.length === 0) {
      // If queue is empty, try to load more
      if (nextCursor) {
        loadFeedQueue(nextCursor);
      }
      return;
    }

    // Remove current from queue
    const newQueue = queueCandidateIds.slice(1);
    setQueueCandidateIds(newQueue);

    // Reset scroll state
    setHasScrolledPastHero(false);

    // Scroll to top
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });

    // Load more if queue is getting low
    if (newQueue.length < 3 && nextCursor) {
      loadFeedQueue(nextCursor, true); // Append to queue
    }
  }, [queueCandidateIds, nextCursor, loadFeedQueue]);

  // Handle swipe actions
  const handleSwipe = useCallback(async (action: 'reject' | 'pass' | 'accept') => {
    if (!user?.id || !currentProfile || swiping) return;

    const candidateId = currentProfile.candidate.user_id;
    setSwiping(true);

    try {
      const result = await submitSwipe(candidateId, action);

      if (result.ok) {
        if (result.remaining_accepts !== undefined) {
          setRemainingAccepts(result.remaining_accepts);
        }

        // Track last action for undo (only for pass and reject, not accept/like)
        if (action === 'pass' || action === 'reject') {
          setLastAction(action);
          setLastCandidateId(candidateId);
        } else {
          // Clear undo state for accept/like actions
          setLastAction(null);
          setLastCandidateId(null);
        }

        // Advance to next profile
        advanceToNext();
      } else if (result.error === 'daily_limit_reached') {
        setShowPremiumModal(true);
        // Don't advance - keep current profile
      }
    } catch (error) {
      console.error('[FeedScreen] Failed to submit swipe:', error);
      Alert.alert('Error', 'Failed to submit swipe. Please try again.');
    } finally {
      setSwiping(false);
    }
  }, [user?.id, currentProfile, swiping, advanceToNext]);

  // Handle heart press (like from photo/prompt)
  const handleHeartPress = useCallback((source: { type: 'photo' | 'prompt'; refId: string }) => {
    setLikeSource(source);
    setShowLikeModal(true);
  }, []);

  // Handle like submission
  const handleLikeSubmit = useCallback(async (message: string | null) => {
    if (!user?.id || !currentProfile || !likeSource) return;

    setShowLikeModal(false);
    setSwiping(true);

    try {
      const candidateId = currentProfile.candidate.user_id;
      
      // First submit the swipe
      const swipeResult = await submitSwipe(candidateId, 'accept');

      if (!swipeResult.ok) {
        if (swipeResult.error === 'daily_limit_reached') {
          setShowPremiumModal(true);
          setSwiping(false);
          return;
        }
        throw new Error('Failed to submit swipe');
      }

      // If daily limit reached, show premium modal and don't send request
      if (swipeResult.error === 'daily_limit_reached') {
        setShowPremiumModal(true);
        setSwiping(false);
        return;
      }

      // Send connection request with compliment
      try {
        await sendConnectionRequest(
          candidateId,
          likeSource.type,
          likeSource.refId,
          message
        );
      } catch (error) {
        console.error('[FeedScreen] Failed to send connection request:', error);
        // Continue anyway - swipe was successful
      }

      // Update remaining accepts
      if (swipeResult.remaining_accepts !== undefined) {
        setRemainingAccepts(swipeResult.remaining_accepts);
      }

      // Advance to next profile
      advanceToNext();
    } catch (error) {
      console.error('[FeedScreen] Failed to process like:', error);
      Alert.alert('Error', 'Failed to send like. Please try again.');
    } finally {
      setSwiping(false);
      setLikeSource(null);
    }
  }, [user?.id, currentProfile, likeSource, advanceToNext]);

  // Handle like button (directly submits like without modal)
  const handleLikeButton = useCallback(async () => {
    if (!user?.id || !currentProfile || swiping) return;

    setSwiping(true);

    try {
      const candidateId = currentProfile.candidate.user_id;
      
      const swipeResult = await submitSwipe(candidateId, 'accept');

      if (!swipeResult.ok) {
        if (swipeResult.error === 'daily_limit_reached') {
          setShowPremiumModal(true);
          setSwiping(false);
          return;
        }
        throw new Error('Failed to submit swipe');
      }

      if (swipeResult.error === 'daily_limit_reached') {
        setShowPremiumModal(true);
        setSwiping(false);
        return;
      }

      // Send connection request (use first photo as source if available)
      const firstPhoto = currentProfile.photos[0];
      if (firstPhoto) {
        try {
          await sendConnectionRequest(
            candidateId,
            'photo',
            firstPhoto.id,
            null // No message for button like
          );
        } catch (error) {
          console.error('[FeedScreen] Failed to send connection request:', error);
          // Continue anyway - swipe was successful
        }
      }

      if (swipeResult.remaining_accepts !== undefined) {
        setRemainingAccepts(swipeResult.remaining_accepts);
      }

      // Advance to next profile
      advanceToNext();
    } catch (error) {
      console.error('[FeedScreen] Failed to process like:', error);
      Alert.alert('Error', 'Failed to send like. Please try again.');
    } finally {
      setSwiping(false);
    }
  }, [user?.id, currentProfile, swiping, advanceToNext]);

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
              // Advance to next profile
              advanceToNext();
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
  }, [user?.id, advanceToNext]);

  const handleClosePremiumModal = () => {
    setShowPremiumModal(false);
  };

  const handleUpgrade = () => {
    // TODO: Navigate to premium upgrade screen
    handleClosePremiumModal();
    console.log('[FeedScreen] Premium upgrade clicked');
  };

  // Handle undo action
  const handleUndo = useCallback(async () => {
    if (!lastAction || !lastCandidateId || swiping) return;

    setSwiping(true);
    try {
      let undoneCandidateId: string | null = null;
      
      if (lastAction === 'pass') {
        undoneCandidateId = await undoPassSwipe();
      } else if (lastAction === 'reject') {
        undoneCandidateId = await undoSwipe();
      }

      if (undoneCandidateId) {
        // Reload the undone profile
        const profile = await loadProfileView(undoneCandidateId);
        if (profile) {
          // Add it back to the front of the queue
          setQueueCandidateIds((prev) => [undoneCandidateId!, ...prev]);
          setCurrentProfile(profile);
          // Reset scroll
          setHasScrolledPastHero(false);
          scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }
        
        // Clear undo state
        setLastAction(null);
        setLastCandidateId(null);
      } else {
        Alert.alert('Nothing to undo', 'There are no recent actions to undo.');
      }
    } catch (error) {
      console.error('[FeedScreen] Failed to undo:', error);
      Alert.alert('Error', 'Failed to undo. Please try again.');
    } finally {
      setSwiping(false);
    }
  }, [lastAction, lastCandidateId, swiping, loadProfileView]);

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

  const hasProfile = currentProfile !== null;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="heading" style={styles.appName}>
          Pawfectly
        </AppText>
        <View style={styles.headerRight}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.push('/(profile)/preferences')}
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
          {hasProfile && (
            <View style={styles.headerBottomRow}>
              {lastAction && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleUndo}
                  disabled={swiping}
                >
                  <MaterialIcons name="undo" size={24} color={Colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setShowBlockMenu(true)}
              >
                <MaterialIcons name="more-horiz" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Hidden Profile Banner */}
      {isProfileHidden === true && (
        <View style={styles.hiddenBanner}>
          <AppText variant="body" style={styles.hiddenBannerText}>
            Your profile is hidden. You won't appear in the feed.
          </AppText>
          <AppButton
            variant="primary"
            style={styles.hiddenBannerButton}
            onPress={handleUnhideProfile}
          >
            Unhide
          </AppButton>
        </View>
      )}

      {/* Profile Content */}
      <View style={styles.contentContainer}>
        {hasProfile ? (
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              const HERO_HEIGHT = Dimensions.get('window').width * 1.2;
              if (offsetY > HERO_HEIGHT * 0.3 && !hasScrolledPastHero) {
                setHasScrolledPastHero(true);
              }
            }}
            scrollEventThrottle={16}
          >
            <FullProfileView
              payload={currentProfile}
              onHeartPress={handleHeartPress}
              hasScrolledPastHero={hasScrolledPastHero}
            />
          </ScrollView>
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

        {/* Fixed Bottom Action Bar */}
        {hasProfile && (
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[styles.actionButton, styles.passButton]}
              onPress={() => handleSwipe('reject')}
              disabled={swiping}
              activeOpacity={0.7}
            >
              <MaterialIcons name="close" size={24} color={Colors.error} />
              <AppText variant="caption" style={styles.actionButtonLabel}>
                Pass
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.skipButton]}
              onPress={() => handleSwipe('pass')}
              disabled={swiping}
              activeOpacity={0.7}
            >
              <MaterialIcons name="schedule" size={24} color={Colors.text} />
              <AppText variant="caption" style={styles.actionButtonLabel}>
                Skip
              </AppText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.likeButton]}
              onPress={handleLikeButton}
              disabled={swiping || (remainingAccepts !== null && remainingAccepts <= 0)}
              activeOpacity={0.7}
            >
              {swiping ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <>
                  <MaterialIcons name="favorite" size={24} color={Colors.background} />
                  <AppText variant="caption" style={styles.likeButtonLabel}>
                    Like
                  </AppText>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

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
                if (currentProfile) {
                  handleBlock('block', currentProfile.candidate.user_id, currentProfile.candidate.display_name);
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
                if (currentProfile) {
                  handleBlock('report', currentProfile.candidate.user_id, currentProfile.candidate.display_name);
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

      {/* Premium Upgrade Modal */}
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

      {/* Like Composer Modal (only shown for heart icon likes) */}
      <LikeComposerModal
        visible={showLikeModal}
        onClose={() => {
          setShowLikeModal(false);
          setLikeSource(null);
        }}
        onSubmit={handleLikeSubmit}
        sourceType={likeSource?.type}
      />
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
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  headerBottomRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  headerButton: {
    padding: Spacing.sm,
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
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.1)',
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: 20,
    minHeight: 56,
    gap: 4,
    maxWidth: 100,
  },
  passButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.error + '80',
  },
  skipButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.text + '60',
  },
  likeButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  actionButtonLabel: {
    marginTop: 2,
    fontWeight: '500',
    fontSize: 12,
    color: Colors.text,
  },
  likeButtonLabel: {
    marginTop: 2,
    fontWeight: '500',
    fontSize: 12,
    color: Colors.background,
  },
  hiddenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFA500',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 8,
  },
  hiddenBannerText: {
    flex: 1,
    color: '#000',
    marginRight: Spacing.md,
  },
  hiddenBannerButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
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
