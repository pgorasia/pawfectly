/**
 * Messages Screen - Complete Implementation
 * Features:
 * - Top lane filter (All/Pals/Match) that filters everything
 * - Matches carousel + "Liked You" card (always shown if liked_you_count > 0)
 * - Messages tab with active threads
 * - Requests tab with Received/Sent sub-tabs (always shown)
 * - Client-side filtering (no network calls on filter change)
 * - SWR-like caching with useRef
 * - Pull-to-refresh
 * - Error handling with non-blocking banner
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { MatchTile } from '@/components/messages/MatchTile';
import { MessageRow } from '@/components/messages/MessageRow';
import { RequestRow } from '@/components/messages/RequestRow';
import { SentRequestTile } from '@/components/messages/SentRequestTile';
import { LikedYouPlaceholder } from '@/components/messages/LikedYouPlaceholder';
import {
  getMessagesHome,
  getIncomingRequests,
  getOrCreateConversation,
  type MessagesHomeResponse,
  type IncomingRequest,
  type Lane,
  type Match,
  type Thread,
  type SentRequest,
} from '@/services/messages/messagesService';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { chatEvents, CHAT_EVENTS, type FirstMessageSentData, type ConversationClosedData, type CrossLaneResolvedData } from '@/utils/chatEvents';
import { truncatePreview } from '@/utils/chatHelpers';
import { resolveCrossLaneConnection, type CrossLaneChoice } from '@/services/messages/crossLaneService';

type LaneFilter = 'all' | 'pals' | 'match';
type TabType = 'messages' | 'requests';
type RequestsSubTab = 'received' | 'sent';

interface CachedData {
  messagesHome: MessagesHomeResponse | null;
  incomingRequests: IncomingRequest[];
  timestamp: number;
}

export default function MessagesScreen() {
  const router = useRouter();

  // Top-level lane filter
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all');

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('messages');
  const [requestsSubTab, setRequestsSubTab] = useState<RequestsSubTab>('received');

  // Data state
  const [messagesHome, setMessagesHome] = useState<MessagesHomeResponse | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);

  // Loading and error state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cross-lane pending choice modal (shown from Matches row)
  const [choiceModalVisible, setChoiceModalVisible] = useState(false);
  const [selectedPending, setSelectedPending] = useState<Match | null>(null);
  const [resolvingChoice, setResolvingChoice] = useState<CrossLaneChoice | null>(null);

  // Cache with useRef for stale-while-revalidate pattern
  const cacheRef = useRef<CachedData>({
    messagesHome: null,
    incomingRequests: [],
    timestamp: 0,
  });

  // Track matches that were opened but have no messages yet
  // This helps restore matches that disappear when ensureConversation is called
  const openedMatchesRef = useRef<Map<string, Match>>(new Map());

  /**
   * Load data from server
   * Uses cache to show stale data immediately, then fetches fresh data
   */
  const loadData = useCallback(async (showLoadingSpinner = true) => {
    try {
      // Show cached data immediately if available
      const cache = cacheRef.current;
      const cacheAge = Date.now() - cache.timestamp;
      if (cache.messagesHome && cacheAge < 60000) {
        // Cache is less than 1 minute old
        setMessagesHome(cache.messagesHome);
        setIncomingRequests(cache.incomingRequests);
        setLoading(false);
      }

      if (showLoadingSpinner && !cache.messagesHome) {
        setLoading(true);
      }
      setError(null);

      // Fetch fresh data in parallel
      const [homeData, requestsData] = await Promise.all([
        getMessagesHome().catch((err) => {
          console.error('[MessagesScreen] getMessagesHome failed:', err);
          return null;
        }),
        getIncomingRequests().catch((err) => {
          console.error('[MessagesScreen] getIncomingRequests failed:', err);
          return [];
        }),
      ]);

      // Update state with fresh data
      if (homeData) {
        // Defensive fix: Restore matches that were opened but have no messages yet
        // If backend removed a match but conversation has no messages, preserve it in matches
        const threadsWithMessages = homeData.threads.filter(t => t.last_message_at && t.last_message_at.trim() !== '');
        const threadsWithoutMessages = homeData.threads.filter(t => !t.last_message_at || t.last_message_at.trim() === '');
        
        // Restore matches for opened conversations that have no messages
        const matchesToRestore: Match[] = [];
        
        // Check each opened match - if it has no messages and is not in matches, restore it
        openedMatchesRef.current.forEach((storedMatch, conversationId) => {
          // Check if this conversation has messages
          const hasMessages = threadsWithMessages.some(t => t.conversation_id === conversationId);
          // Check if it's already in matches
          const inMatches = homeData.matches.some(m => (m.conversation_id || '') === conversationId);
          
          if (!hasMessages && !inMatches) {
            console.log('[MessagesScreen] Restoring match that disappeared:', conversationId, storedMatch.display_name);
            matchesToRestore.push(storedMatch);
          } else if (hasMessages) {
            // Conversation has messages now - remove from tracking
            openedMatchesRef.current.delete(conversationId);
          }
        });
        
        // Convert threads without messages back to matches (if not already tracked)
        threadsWithoutMessages.forEach(thread => {
          const alreadyTracked = openedMatchesRef.current.has(thread.conversation_id);
          const alreadyInMatches = homeData.matches.some(m => (m.conversation_id || '') === thread.conversation_id);
          
          if (!alreadyTracked && !alreadyInMatches) {
            matchesToRestore.push({
              conversation_id: thread.conversation_id,
              user_id: thread.user_id,
              lane: thread.lane,
              connected_at: thread.last_message_at || new Date().toISOString(),
              display_name: thread.display_name,
              dog_name: thread.dog_name,
              hero_storage_path: thread.hero_storage_path,
            });
          }
        });
        
        if (matchesToRestore.length > 0 || threadsWithoutMessages.length > 0) {
          console.log('[MessagesScreen] Restoring matches without messages:', {
            matchesToRestore: matchesToRestore.length,
            threadsWithoutMessages: threadsWithoutMessages.length,
          });
          
          // Merge with existing matches, avoiding duplicates
          const existingMatchIds = new Set(homeData.matches.map(m => m.conversation_id || m.user_id));
          const newMatches = matchesToRestore.filter(m => 
            !existingMatchIds.has(m.conversation_id || m.user_id)
          );
          
          const correctedData = {
            ...homeData,
            matches: [...homeData.matches, ...newMatches],
            threads: threadsWithMessages, // Only threads with messages
          };
          
          setMessagesHome(correctedData);
          cacheRef.current.messagesHome = correctedData;
        } else {
          setMessagesHome(homeData);
          cacheRef.current.messagesHome = homeData;
        }
      }

      setIncomingRequests(requestsData);
      cacheRef.current.incomingRequests = requestsData;
      cacheRef.current.timestamp = Date.now();

      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      console.error('[MessagesScreen] loadData exception:', err);
      setError('Failed to load messages. Pull to refresh.');
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load data on screen focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  /**
   * Listen for first message events from chat screen
   * Move conversation from Matches to Messages ONLY when message is actually sent
   */
  useEffect(() => {
    const handleCrossLaneResolved = (data: CrossLaneResolvedData) => {
      // Cross-lane resolution creates an ACTIVE mutual conversation and inserts any missing accept swipe.
      // A refetch ensures the new connection appears in the Matches row immediately.
      console.log('[MessagesScreen] CROSS_LANE_RESOLVED event received:', data);
      // Avoid blocking UI with the full-screen spinner.
      loadData(false);
      // Keep user on Messages tab so the newly created match is visible.
      setActiveTab('messages');
    };

    const handleFirstMessage = (data: FirstMessageSentData) => {
      console.log('[MessagesScreen] FIRST_MESSAGE_SENT event received:', data);
      console.log('[MessagesScreen] This event should only fire after user sends a message');

      setMessagesHome(prev => {
        if (!prev) {
          console.log('[MessagesScreen] No messagesHome data to update');
          return prev;
        }

        // Find the match by conversation_id first, then by user_id as fallback
        let matchIndex = prev.matches.findIndex(m => 
          m.conversation_id && m.conversation_id === data.conversationId
        );
        
        // If not found by conversation_id, try by peerUserId
        if (matchIndex === -1 && data.peerUserId) {
          matchIndex = prev.matches.findIndex(m => m.user_id === data.peerUserId);
        }

        if (matchIndex === -1) {
          console.log('[MessagesScreen] Match not found for conversation:', data.conversationId, 'peerUserId:', data.peerUserId);
          console.log('[MessagesScreen] Current matches:', prev.matches.map(m => ({ user_id: m.user_id, conversation_id: m.conversation_id })));
          return prev;
        }

        const match = prev.matches[matchIndex];
        console.log('[MessagesScreen] Moving match to messages:', {
          match_user_id: match.user_id,
          conversation_id: data.conversationId,
        });

        // Remove from opened matches tracking (message was sent successfully)
        openedMatchesRef.current.delete(data.conversationId);
        console.log('[MessagesScreen] Removed from opened matches tracking (message sent):', data.conversationId);

        // Create a new thread from the match
        const newThread: Thread = {
          conversation_id: data.conversationId, // Use the real conversation_id from DB
          user_id: match.user_id,
          lane: match.lane,
          last_message_at: data.sentAt, // Must have last_message_at to appear in Messages
          preview: truncatePreview(data.messageText),
          unread_count: 0, // We sent it
          display_name: match.display_name,
          dog_name: match.dog_name,
          hero_storage_path: match.hero_storage_path,
        };

        // Remove from matches, add to threads
        const newMatches = [...prev.matches];
        newMatches.splice(matchIndex, 1);

        const newThreads = [newThread, ...prev.threads]; // Add to top

        console.log('[MessagesScreen] Successfully moved match to messages. Matches remaining:', newMatches.length);

        return {
          ...prev,
          matches: newMatches,
          threads: newThreads,
        };
      });

      // Switch to Messages tab to show the new thread
      setActiveTab('messages');
    };

    const handleConversationClosed = (data: ConversationClosedData) => {
      console.log('[MessagesScreen] CONVERSATION_CLOSED event received:', data);

      // Remove conversation from all lists (threads, matches, sent_requests, incoming_requests)
      setMessagesHome((prev) => {
        if (!prev) {
          console.log('[MessagesScreen] No messagesHome data to update');
          return prev;
        }

        // Remove from threads
        const filteredThreads = prev.threads.filter(
          (t) => t.conversation_id !== data.conversationId
        );

        // Remove from matches
        const filteredMatches = prev.matches.filter(
          (m) => (m.conversation_id || '') !== data.conversationId
        );

        // Remove from sent_requests
        const filteredSentRequests = prev.sent_requests.filter(
          (sr) => sr.conversation_id !== data.conversationId
        );

        const updated = {
          ...prev,
          threads: filteredThreads,
          matches: filteredMatches,
          sent_requests: filteredSentRequests,
        };

        // Update cache as well so reloads use filtered data (same pattern as incoming requests)
        cacheRef.current.messagesHome = updated;
        // Update timestamp so cached data is considered fresh and shown first on reload
        cacheRef.current.timestamp = Date.now();

        console.log('[MessagesScreen] Removed conversation from all lists:', {
          conversationId: data.conversationId,
          reason: data.reason,
          threadsBefore: prev.threads.length,
          threadsAfter: filteredThreads.length,
          matchesBefore: prev.matches.length,
          matchesAfter: filteredMatches.length,
          sentRequestsBefore: prev.sent_requests.length,
          sentRequestsAfter: filteredSentRequests.length,
        });

        return updated;
      });

      // Also remove from incoming requests if present and update cache
      // This follows the same pattern as threads - update state and cache together
      setIncomingRequests((prev) => {
        const filtered = prev.filter((ir) => ir.conversation_id !== data.conversationId);
        // Update cache as well so reloads use filtered data (same pattern as messagesHome)
        cacheRef.current.incomingRequests = filtered;
        // Update cache timestamp so cached data is shown first on reload
        cacheRef.current.timestamp = Date.now();
        console.log('[MessagesScreen] Removed from incoming requests:', {
          conversationId: data.conversationId,
          before: prev.length,
          after: filtered.length,
        });
        return filtered;
      });

      // Remove from opened matches tracking if present
      openedMatchesRef.current.delete(data.conversationId);
    };

    chatEvents.on(CHAT_EVENTS.FIRST_MESSAGE_SENT, handleFirstMessage);
    chatEvents.on(CHAT_EVENTS.CONVERSATION_CLOSED, handleConversationClosed);
    chatEvents.on(CHAT_EVENTS.CROSS_LANE_RESOLVED, handleCrossLaneResolved);

    return () => {
      chatEvents.off(CHAT_EVENTS.FIRST_MESSAGE_SENT, handleFirstMessage);
      chatEvents.off(CHAT_EVENTS.CONVERSATION_CLOSED, handleConversationClosed);
      chatEvents.off(CHAT_EVENTS.CROSS_LANE_RESOLVED, handleCrossLaneResolved);
    };
  }, [loadData]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(false);
  }, [loadData]);

  /**
   * Client-side filtering functions
   * No network calls - filters cached data only
   */
  const filterByLane = <T extends { lane: Lane }>(items: T[]): T[] => {
    if (laneFilter === 'all') return items;
    return items.filter((item) => item.lane === laneFilter);
  };

  // Filtered data
  const filteredMatches = messagesHome ? filterByLane(messagesHome.matches) : [];
  // Filter threads - only include threads that have messages (have last_message_at)
  // This prevents conversations without messages from appearing in Messages tab
  const allThreads = messagesHome ? filterByLane(messagesHome.threads) : [];
  const filteredThreads = allThreads.filter(t => t.last_message_at && t.last_message_at.trim() !== '');
  const filteredSentRequests = messagesHome ? filterByLane(messagesHome.sent_requests) : [];
  const filteredIncomingRequests = filterByLane(incomingRequests);

  // Sort threads by last_message_at (latest first)
  const sortedThreads = [...filteredThreads].sort((a, b) => {
    const timeA = new Date(a.last_message_at).getTime();
    const timeB = new Date(b.last_message_at).getTime();
    return timeB - timeA; // Descending (latest first)
  });

  // Sort sent requests by created_at (latest first)
  const sortedSentRequests = [...filteredSentRequests].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeB - timeA; // Descending (latest first)
  });

  // Sort incoming requests by created_at (latest first)
  const sortedIncomingRequests = [...filteredIncomingRequests].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeB - timeA; // Descending (latest first)
  });

  // Compute counts for badges
  // Unread count = number of threads with unread messages, not total count of unread messages
  const totalUnreadCount = sortedThreads.filter(t => (t.unread_count || 0) > 0).length;
  const incomingRequestsCount = sortedIncomingRequests.length;

  /**
   * Navigation handlers
   */
  const handleMatchPress = async (match: Match) => {
    try {
      // Cross-lane pending: show choice modal (do not create conversation yet)
      if (match.requires_lane_choice) {
        openChoiceModal(match);
        return;
      }

      console.log('[MessagesScreen] Match pressed:', {
        user_id: match.user_id,
        conversation_id: match.conversation_id,
        display_name: match.display_name,
      });

      // Step 1: Ensure conversation exists and get its UUID
      let conversationId: string;
      
      if (match.conversation_id) {
        // If match already has conversation_id, use it
        conversationId = match.conversation_id;
      } else {
        // Otherwise, call getOrCreateConversation to get/create one
        const result = await getOrCreateConversation(match.user_id, match.lane);
        conversationId = result.conversation_id;
        
        // Track this match as opened but not yet messaged
        // Store the match data so we can restore it if user closes without sending
        openedMatchesRef.current.set(conversationId, {
          ...match,
          conversation_id: conversationId, // Store with new conversation_id
        });
        console.log('[MessagesScreen] Tracked opened match (no message yet):', conversationId, match.display_name);
      }

      // Step 2: Navigate with UUID and peer info for header
      router.push({
        pathname: '/messages/[conversationId]',
        params: {
          conversationId, // Always a real UUID
          peerName: match.display_name,
          peerPhotoPath: match.hero_storage_path || '',
          peerUserId: match.user_id, // For profile view
        },
      });
    } catch (error) {
      console.error('[MessagesScreen] Failed to open conversation:', error);
      Alert.alert('Error', 'Failed to open conversation. Please try again.');
    }
  };

  const handleThreadPress = (item: Thread | SentRequest | IncomingRequest) => {
    // Check if this is a sent request by checking if it exists in sent_requests
    const isSentRequest = messagesHome?.sent_requests?.some(sr => sr.conversation_id === item.conversation_id) ?? false;
    
    router.push({
      pathname: '/messages/[conversationId]',
      params: {
        conversationId: item.conversation_id,
        peerName: item.display_name,
        peerPhotoPath: item.hero_storage_path || '',
        peerUserId: item.user_id,
        isSentRequest: isSentRequest ? 'true' : undefined, // Flag for sent requests (pending acceptance)
      },
    });
  };

  const handleRequestPress = (request: IncomingRequest) => {
    router.push({
      pathname: '/messages/[conversationId]',
      params: {
        conversationId: request.conversation_id,
        peerName: request.display_name,
        peerPhotoPath: request.hero_storage_path || '',
        peerUserId: request.user_id,
        isRequest: 'true', // Flag to indicate this is a request
        requestLane: request.lane, // Lane to register like for
      },
    });
  };

  const handleLikedYouPress = () => {
    // Navigate to Liked You tab
    router.push('/liked-you');
  };

  // ---------------- CROSS-LANE CHOICE (FROM MATCHES ROW) ----------------
  const openChoiceModal = useCallback((match: Match) => {
    setSelectedPending(match);
    setChoiceModalVisible(true);
  }, []);

  const closeChoiceModal = useCallback(() => {
    if (resolvingChoice) return;
    setChoiceModalVisible(false);
    setSelectedPending(null);
  }, [resolvingChoice]);

  const handleResolveChoice = useCallback(async (selectedLane: CrossLaneChoice) => {
    if (!selectedPending) return;
    setResolvingChoice(selectedLane);
    try {
      const res = await resolveCrossLaneConnection(selectedPending.user_id, selectedLane);
      if (!res?.ok) {
        throw new Error(res?.error || 'unknown_error');
      }

      // Refresh home so the pending tile disappears and the new thread appears.
      await loadData(false);
      chatEvents.emit(CHAT_EVENTS.CROSS_LANE_RESOLVED, { otherUserId: selectedPending.user_id });
      closeChoiceModal();
    } catch (e: any) {
      console.error('[MessagesScreen] Failed to resolve cross-lane:', e);
      Alert.alert('Something went wrong', 'Unable to resolve this connection right now. Please try again.');
    } finally {
      setResolvingChoice(null);
    }
  }, [selectedPending, loadData, closeChoiceModal]);

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

  /**
   * Matches section (horizontal carousel)
   */
  const renderMatchesSection = () => {
    if (filteredMatches.length === 0) {
      return null;
    }

    return (
      <View style={styles.section}>
        <AppText variant="body" style={styles.sectionTitle}>
          Matches
        </AppText>
        <FlatList
          horizontal
          data={filteredMatches}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <MatchTile match={item} onPress={() => handleMatchPress(item)} />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.matchesContent}
        />
      </View>
    );
  };

  /**
   * Requests sub-tabs (Received / Sent)
   * Always show tabs
   */
  const renderRequestsSubTabs = () => {
    return (
      <View style={styles.subTabsContainer}>
        <TouchableOpacity
          style={[styles.subTab, requestsSubTab === 'received' && styles.subTabActive]}
          onPress={() => setRequestsSubTab('received')}
          activeOpacity={0.7}
        >
          <AppText
            variant="caption"
            style={[styles.subTabText, requestsSubTab === 'received' && styles.subTabTextActive]}
          >
            Received ({sortedIncomingRequests.length})
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.subTab, requestsSubTab === 'sent' && styles.subTabActive]}
          onPress={() => setRequestsSubTab('sent')}
          activeOpacity={0.7}
        >
          <AppText
            variant="caption"
            style={[styles.subTabText, requestsSubTab === 'sent' && styles.subTabTextActive]}
          >
            Sent ({sortedSentRequests.length})
          </AppText>
        </TouchableOpacity>
      </View>
    );
  };

  /**
   * Messages/Requests tabs
   */
  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'messages' && styles.tabActive]}
        onPress={() => setActiveTab('messages')}
        activeOpacity={0.7}
      >
        <AppText variant="body" style={[styles.tabText, activeTab === 'messages' && styles.tabTextActive]}>
          Messages
        </AppText>
        {totalUnreadCount > 0 && (
          <View style={styles.badge}>
            <AppText variant="caption" style={styles.badgeText}>
              {totalUnreadCount}
            </AppText>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
        onPress={() => setActiveTab('requests')}
        activeOpacity={0.7}
      >
        <AppText variant="body" style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
          {incomingRequestsCount > 0 ? `${incomingRequestsCount} Requests` : 'Requests'}
        </AppText>
      </TouchableOpacity>
    </View>
  );

  /**
   * Messages tab content
   */
  const renderMessagesContent = () => {
    if (sortedThreads.length === 0) {
      return (
        <View style={styles.emptyState}>
          <AppText variant="body" style={styles.emptyStateText}>
            No messages yet
          </AppText>
          <AppText variant="caption" style={styles.emptyStateSubtext}>
            {laneFilter === 'all'
              ? 'Start chatting with your matches!'
              : `No ${laneFilter === 'pals' ? 'Pals' : 'Match'} messages`}
          </AppText>
        </View>
      );
    }

    return (
      <FlatList
        data={sortedThreads}
        keyExtractor={(item) => item.conversation_id}
        renderItem={({ item }) => (
          <MessageRow thread={item} onPress={() => handleThreadPress(item)} />
        )}
        scrollEnabled={false}
      />
    );
  };

  /**
   * Requests tab content (with Received/Sent sub-tabs)
   */
  const renderRequestsContent = () => {
    const hasReceived = sortedIncomingRequests.length > 0;
    const hasSent = sortedSentRequests.length > 0;

    // If neither, show empty state
    if (!hasReceived && !hasSent) {
      return (
        <>
          {renderRequestsSubTabs()}
          <View style={styles.emptyState}>
            <AppText variant="body" style={styles.emptyStateText}>
              No requests
            </AppText>
            <AppText variant="caption" style={styles.emptyStateSubtext}>
              {laneFilter === 'all'
                ? 'New connection requests will appear here'
                : `No ${laneFilter === 'pals' ? 'Pals' : 'Match'} requests`}
            </AppText>
          </View>
        </>
      );
    }

    // Always show tabs and active list
    return (
      <>
        {renderRequestsSubTabs()}
        {requestsSubTab === 'received' ? (
          hasReceived ? (
            <FlatList
              data={sortedIncomingRequests}
              keyExtractor={(item) => item.conversation_id}
              renderItem={({ item }) => (
                <RequestRow request={item} onPress={() => handleRequestPress(item)} />
              )}
              scrollEnabled={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <AppText variant="body" style={styles.emptyStateText}>
                No received requests
              </AppText>
            </View>
          )
        ) : (
          hasSent ? (
            <FlatList
              data={sortedSentRequests}
              keyExtractor={(item) => item.conversation_id}
              renderItem={({ item }) => (
                <RequestRow
                  request={{
                    ...item,
                    display_name: item.display_name,
                    preview: 'Pending...',
                  }}
                  onPress={() => handleThreadPress(item)}
                />
              )}
              scrollEnabled={false}
            />
          ) : (
            <View style={styles.emptyState}>
              <AppText variant="body" style={styles.emptyStateText}>
                No sent requests
              </AppText>
            </View>
          )
        )}
      </>
    );
  };

  /**
   * Error banner (non-blocking)
   */
  const renderErrorBanner = () => {
    if (!error) return null;

    return (
      <View style={styles.errorBanner}>
        <AppText variant="caption" style={styles.errorText}>
          {error}
        </AppText>
        <TouchableOpacity onPress={() => setError(null)}>
          <AppText variant="caption" style={styles.errorDismiss}>
            Dismiss
          </AppText>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScreenContainer>
      {/* Top Lane Filter */}
      {renderLaneFilter()}

      {/* Error Banner */}
      {renderErrorBanner()}

      {/* Main Content */}
      {loading && !messagesHome ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <AppText variant="caption" style={styles.loadingText}>
            Loading messages...
          </AppText>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Liked You Tile - Full width, above Matches */}
          {messagesHome && messagesHome.liked_you_count > 0 && (
            <LikedYouPlaceholder
              count={messagesHome.liked_you_count}
              onPress={handleLikedYouPress}
            />
          )}

          {/* Matches Section */}
          {renderMatchesSection()}

          {/* Messages/Requests Tabs */}
          {renderTabs()}

          {/* Tab Content */}
          {activeTab === 'messages' ? renderMessagesContent() : renderRequestsContent()}
        </ScrollView>
      )}

      {/* Cross-lane choice modal (triggered from pending '?' match tile) */}
      <Modal
        visible={choiceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeChoiceModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeChoiceModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <AppText variant="heading" style={styles.modalTitle}>
              {(selectedPending?.display_name ?? 'This person')}
              {' is open to dating. We will let you choose the way forward.'}
            </AppText>

            <View style={styles.modalButtons}>
              <AppButton
                variant="outline"
                onPress={() => handleResolveChoice('pals')}
                loading={resolvingChoice === 'pals'}
                disabled={!!resolvingChoice}
                style={[styles.modalButton, styles.modalButtonLeft]}
              >
                Pals
              </AppButton>

              <AppButton
                variant="primary"
                onPress={() => handleResolveChoice('match')}
                loading={resolvingChoice === 'match'}
                disabled={!!resolvingChoice}
                style={styles.modalButton}
              >
                Match
              </AppButton>
            </View>

            <AppButton
              variant="ghost"
              onPress={closeChoiceModal}
              disabled={!!resolvingChoice}
              style={styles.modalCancel}
            >
              Not now
            </AppButton>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Lane filter (top segmented control)
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

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  errorText: {
    color: '#991B1B',
    flex: 1,
  },
  errorDismiss: {
    color: '#991B1B',
    fontWeight: '600',
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    opacity: 0.6,
  },

  // Scroll view
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },

  // Sections
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },

  // Matches
  matchesContent: {
    paddingHorizontal: Spacing.lg,
  },

  // Sub-tabs (for Requests)
  subTabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
    marginBottom: Spacing.sm,
  },
  subTab: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: 16,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
  },
  subTabActive: {
    backgroundColor: Colors.primary + '20',
  },
  subTabText: {
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.7,
  },
  subTabTextActive: {
    opacity: 1,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: Spacing.xs,
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    opacity: 0.6,
  },
  tabTextActive: {
    opacity: 1,
    fontWeight: '700',
    color: Colors.primary,
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: Colors.background,
    fontSize: 11,
    fontWeight: '700',
  },

  // Cross-lane choice modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 16,
    padding: Spacing.lg,
  },
  modalTitle: {
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
  modalButtonLeft: {
    marginRight: Spacing.md,
  },
  modalCancel: {
    marginTop: Spacing.xs,
  },

  // Empty state
  emptyState: {
    paddingVertical: Spacing.xl * 2,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.5,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    fontSize: 14,
    opacity: 0.4,
    textAlign: 'center',
  },
});
