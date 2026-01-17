/**
 * Chat Screen - Complete Implementation with Chat/Profile Tabs
 * Features:
 * - Two tabs: Chat and Profile (Hinge-style)
 * - Chat tab: auto-focus input, keyboard opens automatically
 * - Profile tab: full profile view (read-only, no actions)
 * - Header with back button and overflow menu
 * - First message detection - moves conversation from Matches to Messages
 * - Optimistic message sending
 * - Error handling with retry
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Keyboard,
  InteractionManager,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { publicPhotoUrl } from '@/utils/photoUrls';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { FullProfileView } from '@/components/profile/FullProfileView';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/supabaseClient';
import {
  getConversationMessages,
  sendMessage,
  markConversationRead,
  closeConversation,
  unmatchUser,
  reportUser,
  acceptRequest,
  rejectRequest,
  type ConversationMessageDTO,
  type ConversationMessagesCursor,
  type ConversationReadReceipt,
} from '@/services/messages/messagesService';
import { submitSwipe } from '@/services/feed/feedService';
import { getProfileView } from '@/services/feed/feedService';
import type { ProfileViewPayload } from '@/types/feed';
import { blockUser } from '@/services/block/blockService';
import { chatEvents, CHAT_EVENTS, type ConversationClosedData } from '@/utils/chatEvents';

type TabType = 'chat' | 'profile';

interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  timestamp: Date;
  isMe: boolean;
  isPending?: boolean;
  hasError?: boolean;
}

/**
 * Generate a UUID v4 for client message IDs
 */
function generateClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatMessageTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function convertToChatMessage(msg: ConversationMessageDTO, currentUserId: string): ChatMessage {
  return {
    id: msg.id,
    text: msg.body,
    senderId: msg.sender_id,
    timestamp: new Date(msg.created_at),
    isMe: msg.sender_id === currentUserId,
  };
}

/**
 * Merge and deduplicate messages by id
 * Server messages win over pending when ids match
 * Returns sorted by timestamp
 */
function mergeMessages(existing: ChatMessage[], serverMessages: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  
  // Add existing messages first
  existing.forEach((m) => map.set(String(m.id), m));
  
  // Server messages overwrite (they are the source of truth)
  serverMessages.forEach((m) => map.set(String(m.id), m));
  
  // Sort by timestamp
  return Array.from(map.values()).sort((a, b) => +a.timestamp - +b.timestamp);
}

type LastOutgoingReceiptStatus = 'delivered' | 'seen' | null;

function MessageBubble({
  message,
  onRetry,
  receiptStatus,
}: {
  message: ChatMessage;
  onRetry?: () => void;
  receiptStatus?: LastOutgoingReceiptStatus;
}) {
  const showReceipt =
    message.isMe && !message.isPending && !message.hasError && receiptStatus != null;

  // WhatsApp-style for this feature: always show double-tick on the last outgoing message.
  // Green only when seen (paid).
  const receiptIcon = 'done-all';

  const receiptColor =
    receiptStatus === 'seen'
      ? Colors.primary
      : Colors.text;

  return (
    <View style={[styles.messageBubbleContainer, message.isMe && styles.myMessageContainer]}>
      <View
        style={[
          styles.messageBubble,
          message.isMe ? styles.myMessageBubble : styles.theirMessageBubble,
          message.isPending && styles.pendingMessage,
          message.hasError && styles.errorMessage,
        ]}
      >
        <AppText variant="body" style={[styles.messageText, message.isMe && styles.myMessageText]}>
          {message.text}
        </AppText>
        {message.isPending && (
          <ActivityIndicator
            size="small"
            color={message.isMe ? Colors.background : Colors.primary}
            style={styles.messageSpinner}
          />
        )}
      </View>
      <View style={styles.messageFooter}>
        <AppText variant="caption" style={styles.messageTime}>
          {message.hasError ? 'Failed to send' : formatMessageTime(message.timestamp)}
        </AppText>
        {showReceipt && (
          <MaterialIcons
            name={receiptIcon as any}
            size={14}
            color={receiptColor}
            style={[styles.receiptIcon, receiptStatus === 'delivered' && { opacity: 0.55 }]}
          />
        )}
        {message.hasError && onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
            <AppText variant="caption" style={styles.retryText}>
              Retry
            </AppText>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function ChatThreadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { user } = useAuth();
  const {
    conversationId,
    peerUserId,
    peerName,
    peerPhotoPath,
    isRequest,
    requestLane,
    isSentRequest,
  } = useLocalSearchParams<{
    conversationId: string;
    peerUserId?: string;
    peerName?: string;
    peerPhotoPath?: string;
    isRequest?: string; // 'true' if this is an incoming request (user needs to Accept/Reject)
    requestLane?: string; // 'pals' | 'match' - lane to register like for
    isSentRequest?: string; // 'true' if this is a sent request (pending acceptance from other user)
  }>();

  // Request state
  const isIncomingRequest = isRequest === 'true'; // Incoming request - show Accept/Reject buttons
  const isPendingSentRequest = isSentRequest === 'true'; // Sent request - disable input until accepted
  const [requestAccepted, setRequestAccepted] = useState(false);
  const [processingRequest, setProcessingRequest] = useState(false);
  
  // Input should be disabled if it's an incoming request (not accepted) OR a sent request (pending)
  const isInputDisabled = (isIncomingRequest && !requestAccepted) || isPendingSentRequest;

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [nextCursor, setNextCursor] = useState<ConversationMessagesCursor>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [readReceipt, setReadReceipt] = useState<ConversationReadReceipt>(null);

  // Profile state
  const [profileData, setProfileData] = useState<ProfileViewPayload | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Keyboard state
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const hasMarkedRead = useRef(false);
  const initialMessageCount = useRef<number>(0); // Track original message count before any sends
  const hasAutoScrolledToBottom = useRef(false);
  const isAtBottomRef = useRef(true);
  const pendingInitialBottomScrollRef = useRef(false);
  const hasDoneInitialLayoutScrollRef = useRef(false);
  const lastRenderedMessageIdRef = useRef<string | null>(null);

  const scrollToBottom = useCallback((animated: boolean) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated });
      });
    });
  }, []);

  // Use peer info from route params, with fallbacks
  const displayName = peerName || 'User';
  const peerPhotoUrl = peerPhotoPath ? publicPhotoUrl(peerPhotoPath) : null;

  // Validate conversationId early - must be a valid UUID
  useEffect(() => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    console.log('[ChatThread] conversationId from params:', conversationId);
    
    if (!conversationId || !uuidRegex.test(conversationId)) {
      console.error('[ChatThread] Invalid conversationId:', conversationId);
      Alert.alert('Error', `Invalid conversation ID: ${conversationId}`);
      router.back();
    }
  }, [conversationId, router]);

  // Load messages on mount
  useEffect(() => {
    // conversationId is always a real UUID now
    if (!conversationId) {
      setMessages([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }

    const loadInitialMessages = async () => {
      setLoading(true);
      try {
        const result = await getConversationMessages(conversationId, 30, null);

        const serverMessages = result.messages.map((msg) => convertToChatMessage(msg, user?.id || ''));
        
        // Extract peer info from first message (the other user)
        if (serverMessages.length > 0) {
          const peerMessage = serverMessages.find((msg) => !msg.isMe);
          // For now, we don't have peer name/photo in messages
          // This should ideally come from conversation metadata or thread data
        }
        
        // Store initial message count - if 0, this is a new conversation without messages
        initialMessageCount.current = serverMessages.length;
        
        // Merge with existing messages (dedupes by id, server wins)
        setMessages((prev) => mergeMessages(prev, serverMessages));
        setNextCursor(result.nextCursor);
        setReadReceipt(result.readReceipt ?? null);

        setLoading(false);

        // Requirement: when chat loads, auto-scroll to bottom.
        // Keyboard + layout timing can otherwise leave us slightly above bottom.
        pendingInitialBottomScrollRef.current = true;
        hasAutoScrolledToBottom.current = true;
        scrollToBottom(false);
        setTimeout(() => scrollToBottom(false), 150);
      } catch (error) {
        console.error('[ChatThread] Failed to load messages:', error);
        Alert.alert('Error', 'Failed to load messages. Please try again.');
        setLoading(false);
      }
    };

    loadInitialMessages();
  }, [conversationId, user?.id]);

  // Single, non-jittery scroll controller:
  // - After initial layout: force bottom once.
  // - After that: only auto-scroll when user is already at bottom and a new message arrives.
  useEffect(() => {
    const last = messages.length ? messages[messages.length - 1] : null;
    const lastId = last ? String(last.id) : null;

    // Track last rendered id for debug and to avoid repeated scrolls.
    if (lastId && lastRenderedMessageIdRef.current !== lastId) {
      lastRenderedMessageIdRef.current = lastId;

      if (isAtBottomRef.current && !pendingInitialBottomScrollRef.current) {
        scrollToBottom(true);
      }
    }
  }, [messages, scrollToBottom]);

  // Realtime: live new messages (no refresh needed)
  useEffect(() => {
    if (!conversationId || !user?.id) return;

    const channel = supabase
      .channel(`conversation_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (__DEV__) {
            console.log('[ChatThread][realtime] conversation_messages INSERT payload:', payload);
          }
          const row = payload.new as any;
          if (!row?.id || !row?.created_at) return;

          const dto: ConversationMessageDTO = {
            id: String(row.id),
            sender_id: row.sender_id,
            kind: row.kind,
            body: row.body,
            metadata: row.metadata,
            created_at: row.created_at,
          };

          const chatMsg = convertToChatMessage(dto, user.id);
          setMessages((prev) => mergeMessages(prev, [chatMsg]));

          // Track that the conversation is no longer empty after first realtime message.
          if (initialMessageCount.current === 0) {
            initialMessageCount.current = 1;
          }

          // If I'm currently at the bottom and viewing the chat tab, mark read for incoming.
          if (row.sender_id !== user.id && activeTab === 'chat' && isAtBottomRef.current) {
            await markConversationRead(conversationId);
          }

          // Auto-scroll only if user is already at bottom.
          if (isAtBottomRef.current) {
            scrollToBottom(true);
          }
        }
      )
      .subscribe((status) => {
        if (__DEV__) {
          console.log('[ChatThread][realtime] conversation_messages subscribe status:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, activeTab, scrollToBottom]);

  // Realtime: live receipt updates (Plus only) without leaking to free users.
  // We infer "plus" by whether the server returned readReceipt != null.
  useEffect(() => {
    if (!conversationId || !user?.id) return;
    if (readReceipt == null) return;

    const channel = supabase
      .channel(`conversation_read_receipts:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_read_receipts',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (__DEV__) {
            console.log('[ChatThread][realtime] conversation_read_receipts change payload:', payload);
          }
          const row = payload.new as any;
          if (!row?.user_id || row.user_id === user.id) return;

          setReadReceipt((prev) =>
            prev
              ? {
                  ...prev,
                  other_last_read_at: row.last_read_at ?? null,
                }
              : prev
          );

          if (isAtBottomRef.current) {
            scrollToBottom(false);
          }
        }
      )
      .subscribe((status) => {
        if (__DEV__) {
          console.log('[ChatThread][realtime] conversation_read_receipts subscribe status:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id, readReceipt, scrollToBottom]);

  // B) Load older messages for pagination
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !nextCursor || loadingOlder) return;

    setLoadingOlder(true);
    try {
      const result = await getConversationMessages(conversationId, 30, nextCursor);

      const olderMessages = result.messages.map((msg) => convertToChatMessage(msg, user?.id || ''));
      
      // Merge with existing messages (dedupes by id, server wins)
      setMessages(prev => mergeMessages(prev, olderMessages));
      setNextCursor(result.nextCursor);

      setLoadingOlder(false);
    } catch (error) {
      console.error('[ChatThread] Failed to load older messages:', error);
      setLoadingOlder(false);
    }
  }, [conversationId, nextCursor, loadingOlder, user?.id]);

  // Auto-focus input and open keyboard when Chat tab is active
  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'chat') {
        // Small delay to ensure the input is mounted.
        // Avoid dismissing the keyboard on Android; it can prevent the keyboard from
        // re-opening reliably when combined with KeyboardAvoidingView.
        const timer = setTimeout(() => {
          inputRef.current?.focus();
          if (Platform.OS === 'android') {
            setTimeout(() => inputRef.current?.focus(), 75);
          }
        }, 250);
        return () => clearTimeout(timer);
      }
    }, [activeTab])
  );

  // Load profile data when Profile tab is opened
  useEffect(() => {
    if (activeTab === 'profile' && !profileData && peerUserId) {
      const loadProfile = async () => {
        setProfileLoading(true);
        try {
          const data = await getProfileView(peerUserId);
          setProfileData(data);
        } catch (error) {
          console.error('[ChatThread] Failed to load profile:', error);
          Alert.alert('Error', 'Failed to load profile');
        } finally {
          setProfileLoading(false);
        }
      };
      loadProfile();
    }
  }, [activeTab, profileData, peerUserId]);

  // Track keyboard visibility
  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
      if (pendingInitialBottomScrollRef.current) {
        pendingInitialBottomScrollRef.current = false;
        scrollToBottom(false);
      }
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Mark conversation as read when screen becomes active
  useEffect(() => {
    if (!conversationId || hasMarkedRead.current) return;

    const markAsRead = async () => {
      const { error } = await markConversationRead(conversationId);

      if (error) {
        console.error('[ChatThread] Failed to mark as read:', error);
        return;
      }

      hasMarkedRead.current = true;
    };

    markAsRead();
  }, [conversationId]);

  // Optimistic send with first-message detection
  const handleSend = async () => {
    if (inputText.trim().length === 0 || !conversationId) {
      console.error('[ChatThread] handleSend: missing input or conversationId', {
        hasInput: inputText.trim().length > 0,
        conversationId,
      });
      return;
    }

    // Validate conversationId is a valid UUID before sending
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      console.error('[ChatThread] handleSend: Invalid conversationId format:', conversationId);
      Alert.alert('Error', `Invalid conversation ID: ${conversationId}`);
      return;
    }

    const messageText = inputText.trim();
    const clientMessageId = generateClientMessageId(); // Generate UUID for client message ID
    
    console.log('[ChatThread] handleSend:', {
      conversationId,
      messageText: messageText.substring(0, 50),
      clientMessageId,
    });

    // Create pending message with clientMessageId
    const pendingMessage: ChatMessage = {
      id: clientMessageId,
      text: messageText,
      senderId: user?.id || 'me',
      timestamp: new Date(),
      isMe: true,
      isPending: true,
    };

    // Check if this is the first message - use initial count, not current messages array
    // (which might have previous optimistic messages that failed)
    const isFirstMessage = initialMessageCount.current === 0;
    
    console.log('[ChatThread] handleSend - isFirstMessage:', isFirstMessage, 'initialCount:', initialMessageCount.current);

    // Optimistically add to UI
    setMessages((prev) => [...prev, pendingMessage]);
    setInputText('');

    // Scroll to bottom after sending
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Send message with all 5 parameters
    const { data, error } = await sendMessage(
      conversationId,
      messageText,
      'text',
      {},
      clientMessageId
    );

    if (error) {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === clientMessageId ? { ...msg, isPending: false, hasError: true } : msg))
      );
      return;
    }

    // Replace pending message id with server message_id
    if (data) {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === clientMessageId ? { ...msg, id: data.message_id, isPending: false } : msg))
      );

      // Keep receipt state consistent for Plus users without an extra fetch:
      // after sending, the "last message" is ours, but server receipt payload we fetched earlier may be stale.
      setReadReceipt((prev) =>
        prev
          ? {
              ...prev,
              other_last_read_at: prev.other_last_read_at ?? null,
            }
          : prev
      );

      // Only emit FIRST_MESSAGE_SENT event if this was the first message and we have peer info
      // This moves the conversation from Matches to Messages only after user actually sends a message
      // Use initialMessageCount to ensure we only emit when conversation was truly empty at load
      if (isFirstMessage && peerUserId) {
        console.log('[ChatThread] First message sent successfully, emitting FIRST_MESSAGE_SENT event');
        chatEvents.emit(CHAT_EVENTS.FIRST_MESSAGE_SENT, {
          conversationId: conversationId,
          peerUserId: peerUserId,
          messageText,
          messageId: data.message_id,
          sentAt: new Date().toISOString(),
        });
        // Mark as no longer first message after successful send
        initialMessageCount.current = 1;
      }
    }
  };

  // Retry failed message
  const handleRetry = async (messageId: string) => {
    const failedMessage = messages.find((m) => m.id === messageId);
    if (!failedMessage || !conversationId) return;

    // Mark as pending again
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, isPending: true, hasError: false } : msg
      )
    );

    // Try sending again
    const { data, error } = await sendMessage(conversationId, failedMessage.text);

    if (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId ? { ...msg, isPending: false, hasError: true } : msg
        )
      );
      return;
    }

    // Replace with real message
    if (data) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, id: data.message_id, isPending: false, hasError: false }
            : msg
        )
      );
    }
  };

  // Navigate to profile (read-only)
  const handleProfilePress = () => {
    setActiveTab('profile');
  };

  // Accept incoming request
  const handleAcceptRequest = async () => {
    if (!conversationId || !peerUserId || !requestLane) {
      Alert.alert('Error', 'Missing information to accept request');
      return;
    }

    setProcessingRequest(true);
    try {
      console.log('[ChatThread] Accepting request:', {
        conversationId,
        peerUserId,
        lane: requestLane,
      });

      // 1. Accept the request (moves conversation from request to active)
      const acceptResult = await acceptRequest(conversationId);
      if (acceptResult.error || !acceptResult.data?.success) {
        console.error('[ChatThread] Failed to accept request:', acceptResult.error);
        Alert.alert('Error', acceptResult.error?.message || 'Failed to accept request. Please try again.');
        setProcessingRequest(false);
        return;
      }

      // 2. Register a like from user for that candidate for the lane candidate sent request for
      try {
        await submitSwipe(peerUserId, 'accept', requestLane as 'pals' | 'match');
        console.log('[ChatThread] Like registered successfully');
      } catch (swipeError) {
        console.error('[ChatThread] Failed to register like:', swipeError);
        // Continue anyway - request is already accepted
      }

      // 3. Enable input and mark request as accepted
      setRequestAccepted(true);
      console.log('[ChatThread] Request accepted successfully');
      
      // 4. Focus the input and open keyboard after a short delay
      setTimeout(() => {
        inputRef.current?.focus();
        // On Android, sometimes need to explicitly show keyboard
        if (Platform.OS === 'android') {
          setTimeout(() => {
            inputRef.current?.focus();
          }, 100);
        }
      }, 200);
    } catch (error) {
      console.error('[ChatThread] Error accepting request:', error);
      Alert.alert('Error', 'Failed to accept request. Please try again.');
    } finally {
      setProcessingRequest(false);
    }
  };

  // Reject incoming request
  const handleRejectRequest = async () => {
    if (!conversationId) {
      Alert.alert('Error', 'Missing conversation information');
      return;
    }

    Alert.alert(
      'Reject Request',
      `Are you sure you want to reject ${displayName}'s request?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setProcessingRequest(true);
            try {
              console.log('[ChatThread] Rejecting request:', { conversationId });

              const rejectResult = await rejectRequest(conversationId);
              if (rejectResult.error || !rejectResult.data?.success) {
                console.error('[ChatThread] Failed to reject request:', rejectResult.error);
                Alert.alert('Error', rejectResult.error?.message || 'Failed to reject request. Please try again.');
                setProcessingRequest(false);
                return;
              }

              // Emit event to notify messages screen to remove request from UI
              chatEvents.emit(CHAT_EVENTS.CONVERSATION_CLOSED, {
                conversationId,
                reason: 'unmatch', // Use unmatch reason for UI removal
              } as ConversationClosedData);

              console.log('[ChatThread] Request rejected successfully');
              
              // Navigate back after rejecting
              router.back();
            } catch (error) {
              console.error('[ChatThread] Error rejecting request:', error);
              Alert.alert('Error', 'Failed to reject request. Please try again.');
              setProcessingRequest(false);
            }
          },
        },
      ]
    );
  };

  // Header actions
  const handleUnmatch = async () => {
    if (!conversationId || !peerUserId) {
      Alert.alert('Error', 'Unable to unmatch: missing conversation or user information');
      return;
    }

    Alert.alert(
      'Unmatch',
      `Are you sure you want to unmatch with ${displayName}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowMenu(false);
              console.log('[ChatThread] Unmatching user:', {
                conversationId,
                peerUserId,
                displayName,
              });

              // Unmatch: Delete conversation + pass for all active lanes
              const result = await unmatchUser(peerUserId, conversationId);

              if (result.error || !result.data?.success) {
                console.error('[ChatThread] Failed to unmatch:', result.error);
                Alert.alert('Error', result.error?.message || 'Failed to unmatch. Please try again.');
                return;
              }

              // Emit event to notify messages screen to remove conversation from UI
              chatEvents.emit(CHAT_EVENTS.CONVERSATION_CLOSED, {
                conversationId,
                reason: 'unmatch',
              } as ConversationClosedData);

              console.log('[ChatThread] Successfully unmatched');
              // Navigate back after successful unmatch
              router.back();
            } catch (error) {
              console.error('[ChatThread] Unmatch exception:', error);
              Alert.alert('Error', 'Failed to unmatch. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleBlock = async () => {
    if (!user?.id || !peerUserId || !conversationId) {
      Alert.alert('Error', 'Unable to block user: missing user information');
      return;
    }

    Alert.alert(
      'Block User',
      `Are you sure you want to block ${displayName}? They won't appear in your feed anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowMenu(false);
              console.log('[ChatThread] Blocking user:', {
                conversationId,
                peerUserId,
                displayName,
              });

              // Block the user (existing block functionality)
              await blockUser(user.id, peerUserId, 'block');

              // Close conversation (deletes for both users, notifies peer)
              const closeResult = await closeConversation(conversationId, true, 'block');
              if (closeResult.error || !closeResult.data?.success) {
                console.error('[ChatThread] Failed to close conversation:', closeResult.error || 'Unknown error');
                // Continue anyway - block already succeeded, but conversation might still be visible
                Alert.alert('Warning', 'User blocked, but conversation could not be closed. Please refresh.');
              } else {
                console.log('[ChatThread] Conversation closed successfully');
              }
              
              // Emit event to notify messages screen to remove conversation from UI (always emit, even if closeConversation had issues)
              console.log('[ChatThread] Emitting CONVERSATION_CLOSED event:', { conversationId, reason: 'block' });
              chatEvents.emit(CHAT_EVENTS.CONVERSATION_CLOSED, {
                conversationId,
                reason: 'block',
              } as ConversationClosedData);

              console.log('[ChatThread] User blocked successfully');
              
              // Small delay to ensure event is processed before navigation
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Navigate back after blocking
              router.back();
            } catch (error) {
              console.error('[ChatThread] Failed to block user:', error);
              Alert.alert('Error', 'Failed to block user. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleReport = async () => {
    if (!user?.id || !peerUserId || !conversationId) {
      Alert.alert('Error', 'Unable to report user: missing user information');
      return;
    }

    Alert.alert(
      'Report User',
      `Are you sure you want to report ${displayName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowMenu(false);
              console.log('[ChatThread] Reporting user:', {
                conversationId,
                peerUserId,
                displayName,
              });

              // Report the user (deletes conversation, tracks for flagging if reported by multiple users)
              const result = await reportUser(
                peerUserId,
                'inappropriate_behavior', // Reason for the report
                null, // No additional details for now
                conversationId
              );

              if (result.error || !result.data?.success) {
                console.error('[ChatThread] Failed to report user:', result.error);
                Alert.alert('Error', result.error?.message || 'Failed to report user. Please try again.');
                return;
              }

              // Emit event to notify messages screen to remove conversation from UI
              chatEvents.emit(CHAT_EVENTS.CONVERSATION_CLOSED, {
                conversationId,
                reason: 'report',
              } as ConversationClosedData);

              console.log('[ChatThread] User reported successfully');
              
              // Show confirmation and navigate back
              Alert.alert('Reported', 'Thank you for your report. We will review it.', [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                },
              ]);
            } catch (error) {
              console.error('[ChatThread] Failed to report user:', error);
              Alert.alert('Error', 'Failed to report user. Please try again.');
            }
          },
        },
      ]
    );
  };

  const systemBarSpacerHeight = Math.max(insets.bottom, 0);
  const systemBarSpacerColor = Platform.OS === 'android' ? '#000000' : Colors.background;

  const lastOutgoingMessage = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.isMe && !m.isPending && !m.hasError) return m;
    }
    return null;
  }, [messages]);

  const isLastOutgoingSeen = React.useMemo(() => {
    if (!lastOutgoingMessage) return false;
    if (!readReceipt?.other_last_read_at) return false;
    return new Date(readReceipt.other_last_read_at).getTime() >= lastOutgoingMessage.timestamp.getTime();
  }, [lastOutgoingMessage, readReceipt?.other_last_read_at]);

  return (
    // Use only TOP safe-area here.
    // Bottom is handled explicitly so action bars can sit flush above a consistent
    // "letterbox" spacer (black on Android, background on iOS).
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackTitle: 'Back',
          headerTitle: () => (
            <View style={styles.headerContent}>
              {peerPhotoUrl ? (
                <Image source={{ uri: peerPhotoUrl }} style={styles.headerAvatar} />
              ) : (
                <View style={styles.headerAvatarPlaceholder}>
                  <AppText variant="body" style={styles.headerAvatarText}>
                    {displayName[0]?.toUpperCase() || '?'}
                  </AppText>
                </View>
              )}
              <AppText variant="body" style={styles.headerName}>
                {displayName}
              </AppText>
            </View>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setShowMenu(!showMenu)}
              style={styles.headerMenuButton}
              activeOpacity={0.7}
            >
              <MaterialIcons name="more-vert" size={24} color={Colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Overflow menu */}
      {showMenu && (
        <View style={styles.menuOverlay}>
          <TouchableOpacity
            style={styles.menuBackdrop}
            onPress={() => setShowMenu(false)}
            activeOpacity={1}
          />
          <View style={styles.menuContainer}>
            {/* For incoming requests, only show Block and Report */}
            {isIncomingRequest ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
                  <MaterialIcons name="block" size={20} color={Colors.text} />
                  <AppText variant="body" style={styles.menuItemText}>
                    Block
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <MaterialIcons name="flag" size={20} color="#ef4444" />
                  <AppText variant="body" style={[styles.menuItemText, { color: '#ef4444' }]}>
                    Report
                  </AppText>
                </TouchableOpacity>
              </>
            ) : (
              /* For active conversations, show all options */
              <>
                <TouchableOpacity style={styles.menuItem} onPress={handleUnmatch}>
                  <MaterialIcons name="person-remove" size={20} color={Colors.text} />
                  <AppText variant="body" style={styles.menuItemText}>
                    Unmatch
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleBlock}>
                  <MaterialIcons name="block" size={20} color={Colors.text} />
                  <AppText variant="body" style={styles.menuItemText}>
                    Block
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <MaterialIcons name="flag" size={20} color="#ef4444" />
                  <AppText variant="body" style={[styles.menuItemText, { color: '#ef4444' }]}>
                    Report
                  </AppText>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
          onPress={() => setActiveTab('chat')}
          activeOpacity={0.7}
        >
          <AppText variant="body" style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            Chat
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.7}
        >
          <AppText variant="body" style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
            Profile
          </AppText>
        </TouchableOpacity>
      </View>

      {/* Tab Content */}
      {activeTab === 'chat' ? (
        <KeyboardAvoidingView
          style={styles.keyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
        >
          <View style={styles.contentContainer}>
            {/* Pending Request Banner */}
            {isPendingSentRequest && (
              <View style={styles.pendingBanner}>
                <MaterialIcons name="schedule" size={16} color={Colors.text} style={styles.pendingBannerIcon} />
                <AppText variant="caption" style={styles.pendingBannerText}>
                  Your request is pending. You'll be able to send messages once {displayName} accepts.
                </AppText>
              </View>
            )}
            
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : messages.length > 0 ? (
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => String(item.id)}
                renderItem={({ item }) => {
                  const isLastOutgoing = lastOutgoingMessage?.id === item.id;

                  const receiptStatus: LastOutgoingReceiptStatus = isLastOutgoing
                    ? isLastOutgoingSeen
                      ? 'seen'
                      : 'delivered'
                    : null;

                  return (
                    <MessageBubble
                      message={item}
                      onRetry={item.hasError ? () => handleRetry(item.id) : undefined}
                      receiptStatus={receiptStatus}
                    />
                  );
                }}
                contentContainerStyle={styles.messagesList}
                onLayout={() => {
                  // Do the "initial bottom" exactly once after first layout.
                  if (!hasDoneInitialLayoutScrollRef.current) {
                    hasDoneInitialLayoutScrollRef.current = true;
                    pendingInitialBottomScrollRef.current = false;
                    scrollToBottom(false);
                    return;
                  }
                }}
                onScroll={(e) => {
                  const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                  const paddingToBottom = 24;
                  isAtBottomRef.current =
                    layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
                }}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                ListHeaderComponent={
                  <>
                    {nextCursor && !loadingOlder ? (
                      <TouchableOpacity 
                        style={styles.loadOlderButton} 
                        onPress={loadOlderMessages}
                        activeOpacity={0.7}
                      >
                        <AppText variant="caption" style={styles.loadOlderText}>
                          Load older messages
                        </AppText>
                      </TouchableOpacity>
                    ) : loadingOlder ? (
                      <View style={styles.loadOlderButton}>
                        <ActivityIndicator size="small" color={Colors.primary} />
                      </View>
                    ) : null}
                  </>
                }
              />
            ) : (
              <View style={styles.emptyState}>
                <AppText variant="body" style={styles.emptyStateText}>
                  No messages yet
                </AppText>
                <AppText variant="caption" style={styles.emptyStateSubtext}>
                  Send a message to start the conversation
                </AppText>
              </View>
            )}

            {/* Input Bar or Request Actions */}
            {isIncomingRequest && !requestAccepted ? (
              <View style={styles.footerContainer}>
                <View style={styles.requestActionsContainer}>
                <TouchableOpacity
                  style={[styles.requestButton, styles.rejectButton, processingRequest && styles.buttonDisabled]}
                  onPress={handleRejectRequest}
                  disabled={processingRequest}
                  activeOpacity={0.7}
                >
                  <AppText variant="body" style={styles.rejectButtonText}>
                    Reject
                  </AppText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.requestButton, styles.acceptButton, processingRequest && styles.buttonDisabled]}
                  onPress={handleAcceptRequest}
                  disabled={processingRequest}
                  activeOpacity={0.7}
                >
                  {processingRequest ? (
                    <ActivityIndicator size="small" color={Colors.background} />
                  ) : (
                    <AppText variant="body" style={styles.acceptButtonText}>
                      Accept
                    </AppText>
                  )}
                </TouchableOpacity>
                </View>
                {/* System navigation spacer ("letterbox") */}
                <View style={[styles.systemBarSpacer, { height: systemBarSpacerHeight, backgroundColor: systemBarSpacerColor }]} />
              </View>
            ) : (
              <View style={styles.footerContainer}>
                <View style={[
                  styles.inputContainer,
                  isKeyboardVisible && { paddingBottom: Spacing.sm + Math.max(insets.bottom, 0) }
                ]}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder="Type a message..."
                    placeholderTextColor="rgba(31, 41, 55, 0.4)"
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    maxLength={1000}
                    returnKeyType="default"
                    blurOnSubmit={false}
                    editable={!isInputDisabled}
                    onFocus={() => {
                      // Scroll to bottom when input is focused
                      setTimeout(() => {
                        flatListRef.current?.scrollToEnd({ animated: true });
                      }, 100);
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.sendButton, (inputText.trim().length === 0 || isInputDisabled) && styles.sendButtonDisabled]}
                    onPress={handleSend}
                    disabled={inputText.trim().length === 0 || isInputDisabled}
                    activeOpacity={0.7}
                  >
                    <AppText variant="body" style={styles.sendButtonText}>
                      Send
                    </AppText>
                  </TouchableOpacity>
                </View>
                {/* System navigation spacer ("letterbox") */}
                <View style={[styles.systemBarSpacer, { height: systemBarSpacerHeight, backgroundColor: systemBarSpacerColor }]} />
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.profileContainer}>
          <ScrollView 
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 0) }}
          >
            {profileLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            ) : profileData ? (
              <FullProfileView payload={profileData} readOnly={true} />
            ) : (
              <View style={styles.emptyState}>
                <AppText variant="body" style={styles.emptyStateText}>
                  Profile not available
                </AppText>
              </View>
            )}
          </ScrollView>
          {/* System navigation spacer ("letterbox") for Android navigation buttons */}
          <View style={[styles.systemBarSpacer, { height: systemBarSpacerHeight, backgroundColor: systemBarSpacerColor }]} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  footerContainer: {
    width: '100%',
  },
  systemBarSpacer: {
    width: '100%',
  },
  profileContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Header styles
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
    backgroundColor: Colors.background,
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
    fontSize: 15,
    fontWeight: '500',
    opacity: 0.6,
  },
  tabTextActive: {
    opacity: 1,
    fontWeight: '700',
    color: Colors.primary,
  },
  headerMenuButton: {
    padding: Spacing.sm,
  },
  // Menu overlay
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  menuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  menuContainer: {
    position: 'absolute',
    top: 50,
    right: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingVertical: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 160,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  menuItemText: {
    fontSize: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadOlderButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadOlderText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  messagesList: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  messageBubbleContainer: {
    marginVertical: Spacing.xs,
    maxWidth: '75%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageBubble: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 16,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  theirMessageBubble: {
    backgroundColor: 'rgba(31, 41, 55, 0.1)',
    borderBottomLeftRadius: 4,
  },
  myMessageBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  pendingMessage: {
    opacity: 0.7,
  },
  errorMessage: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
  },
  myMessageText: {
    color: Colors.background,
  },
  messageSpinner: {
    marginLeft: Spacing.xs,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  messageTime: {
    fontSize: 11,
    opacity: 0.5,
  },
  receiptIcon: {
    marginTop: 1,
  },
  retryButton: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  retryText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.1)',
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingTop: Spacing.sm,
    marginRight: Spacing.sm,
    maxHeight: 100,
    minHeight: 40,
    fontSize: 15,
    textAlignVertical: 'center',
  },
  sendButton: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 70,
    height: 40,
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: Colors.background,
    fontWeight: '600',
    fontSize: 15,
  },
  // Request actions
  requestActionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.1)',
    backgroundColor: Colors.background,
  },
  requestButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  acceptButton: {
    backgroundColor: Colors.primary,
  },
  acceptButtonText: {
    color: Colors.background,
    fontWeight: '600',
    fontSize: 16,
  },
  rejectButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  rejectButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  // Pending request banner
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.1)', // Orange tint
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(249, 115, 22, 0.2)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  pendingBannerIcon: {
    opacity: 0.8,
  },
  pendingBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text,
    opacity: 0.9,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyStateText: {
    opacity: 0.5,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    opacity: 0.4,
    textAlign: 'center',
  },
});
