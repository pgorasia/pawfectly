import React, { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { FullProfileView } from '@/components/profile/FullProfileView';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useAuth } from '@/contexts/AuthContext';
import { getProfileView } from '@/services/feed/feedService';
import type { ProfileViewPayload } from '@/types/feed';
import {
  getCrossLanePending,
  resolveCrossLaneConnection,
  type CrossLaneChoice,
  type CrossLanePendingDetails,
} from '@/services/messages/crossLaneService';
import { chatEvents, CHAT_EVENTS } from '@/utils/chatEvents';

type TabType = 'chat' | 'profile';

function formatTimeRemaining(targetIso: string): string {
  const targetMs = new Date(targetIso).getTime();
  const diffMs = Math.max(0, targetMs - Date.now());

  const totalMinutes = Math.max(0, Math.ceil(diffMs / (60 * 1000)));

  // Display a single unit:
  // - >= 24h: days (rounded up)
  // - >= 60m: hours (rounded up)
  // - else: minutes
  if (totalMinutes >= 60 * 24) {
    const days = Math.ceil(totalMinutes / (60 * 24));
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (totalMinutes >= 60) {
    const hours = Math.ceil(totalMinutes / 60);
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }

  const mins = totalMinutes;
  return `${mins} min${mins === 1 ? '' : 's'}`;
}

export default function CrossLanePendingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { otherUserId, peerName, peerPhotoPath, peerUserId } = useLocalSearchParams<{
    otherUserId: string;
    peerName?: string;
    peerPhotoPath?: string;
    peerUserId?: string;
  }>();

  const otherId = otherUserId || peerUserId || '';
  const displayName = peerName || 'This person';

  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [pending, setPending] = useState<CrossLanePendingDetails | null>(null);
  const [profile, setProfile] = useState<ProfileViewPayload | null>(null);
  const [resolvingChoice, setResolvingChoice] = useState<CrossLaneChoice | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !otherId) return;
    setLoadingPending(true);
    setLoadingProfile(true);
    setProfile(null);

    try {
      const pendingRes = await getCrossLanePending(otherId);
      setPending(pendingRes);
    } catch (e: any) {
      console.error('[CrossLanePendingScreen] pending load failed:', e);
      setPending(null);
      Alert.alert('Error', 'Unable to load this connection right now.');
      return;
    } finally {
      setLoadingPending(false);
    }

    // Profile is optional for rendering the pending message; load it in parallel.
    getProfileView(otherId)
      .then((profileRes) => setProfile(profileRes))
      .catch((e: any) => {
        console.error('[CrossLanePendingScreen] profile load failed:', e);
        setProfile(null);
      })
      .finally(() => setLoadingProfile(false));
  }, [user?.id, otherId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleResolve = useCallback(
    async (selectedLane: CrossLaneChoice) => {
      if (!otherId) return;
      setResolvingChoice(selectedLane);
      try {
        const res = await resolveCrossLaneConnection(otherId, selectedLane);
        if (!res?.ok || !res.conversation_id) {
          throw new Error(res?.error || 'unknown_error');
        }

        // Notify Messages tab to refresh its lists.
        chatEvents.emit(CHAT_EVENTS.CROSS_LANE_RESOLVED, { otherUserId: otherId });

        router.replace({
          pathname: '/messages/[conversationId]',
          params: {
            conversationId: res.conversation_id,
            peerName: displayName,
            peerPhotoPath: peerPhotoPath || '',
            peerUserId: otherId,
          },
        });
      } catch (e: any) {
        console.error('[CrossLanePendingScreen] resolve failed:', e);
        Alert.alert('Something went wrong', 'Unable to resolve this connection right now. Please try again.');
      } finally {
        setResolvingChoice(null);
      }
    },
    [otherId, router, displayName, peerPhotoPath]
  );

  const isChooser = pending?.is_chooser === true;
  const message = pending?.message ?? null;
  const timeLeftText = pending?.expires_at ? formatTimeRemaining(pending.expires_at) : null;
  const systemBarSpacerHeight = Math.max(insets.bottom, 0);
  const systemBarSpacerColor = Platform.OS === 'android' ? '#000000' : Colors.background;

  return (
    // Match the main chat screen: top safe-area only, bottom uses a colored spacer ("letterbox").
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppText variant="body" style={styles.headerTitle} numberOfLines={1}>
            {displayName}
          </AppText>
          <AppText variant="caption" style={styles.headerSubtitle} numberOfLines={1}>
            Pending connection
          </AppText>
        </View>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.tabActive]}
          onPress={() => setActiveTab('chat')}
          activeOpacity={0.7}
        >
          <AppText variant="caption" style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>
            Chat
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.tabActive]}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.7}
        >
          <AppText variant="caption" style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
            Profile
          </AppText>
        </TouchableOpacity>
      </View>

      {loadingPending ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : activeTab === 'chat' ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
        >
          <View style={styles.banner}>
            <AppText variant="body" style={styles.bannerTitle}>
              {displayName} is open to dating. Choose the way forward.
            </AppText>
            {timeLeftText !== null && (
              <AppText variant="caption" style={styles.bannerSubtitle}>
                Connection will be defaulted to Pals in {timeLeftText}.
              </AppText>
            )}
          </View>

          {!!message?.body && (
            <View style={[styles.messageBubble, message.sender_id === user?.id ? styles.myBubble : styles.theirBubble]}>
              <AppText
                variant="caption"
                style={[styles.messageLabel, message.sender_id === user?.id && styles.messageLabelOnPrimary]}
              >
                {message.sender_id === user?.id ? 'You' : displayName}
              </AppText>
              <AppText
                variant="body"
                style={[styles.messageText, message.sender_id === user?.id && styles.messageTextOnPrimary]}
              >
                {message.body}
              </AppText>
            </View>
          )}

          {isChooser ? (
            <View style={styles.choiceRow}>
              <AppButton
                variant="outline"
                onPress={() => handleResolve('pals')}
                loading={resolvingChoice === 'pals'}
                disabled={!!resolvingChoice || !pending?.ok}
                style={styles.choiceButton}
              >
                Pals
              </AppButton>
              <AppButton
                variant="primary"
                onPress={() => handleResolve('match')}
                loading={resolvingChoice === 'match'}
                disabled={!!resolvingChoice || !pending?.ok}
                style={styles.choiceButton}
              >
                Match
              </AppButton>
            </View>
          ) : (
            <View style={styles.waiting}>
              <AppText variant="caption" style={styles.waitingText}>
                Waiting for them to choose Pals or Match.
              </AppText>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.content}>
          {loadingProfile ? (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : profile ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
              <FullProfileView payload={profile} readOnly />
            </ScrollView>
          ) : (
            <View style={styles.noProfile}>
              <AppText variant="caption" style={styles.noProfileText}>
                Profile unavailable.
              </AppText>
            </View>
          )}
        </View>
      )}

      {/* System navigation spacer ("letterbox") */}
      <View
        style={[
          styles.systemBarSpacer,
          { height: systemBarSpacerHeight, backgroundColor: systemBarSpacerColor },
        ]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    opacity: 0.6,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: 16,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.primary + '20',
  },
  tabText: {
    opacity: 0.7,
    fontWeight: '600',
  },
  tabTextActive: {
    opacity: 1,
    color: Colors.primary,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  systemBarSpacer: {
    width: '100%',
  },
  banner: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  bannerTitle: {
    fontWeight: '700',
  },
  bannerSubtitle: {
    marginTop: 6,
    opacity: 0.7,
  },
  messageBubble: {
    borderRadius: 14,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  myBubble: {
    backgroundColor: Colors.primary,
  },
  theirBubble: {
    backgroundColor: Colors.cardBackground,
  },
  messageLabel: {
    opacity: 0.7,
    color: Colors.text,
    marginBottom: 6,
  },
  messageLabelOnPrimary: {
    color: Colors.background,
    opacity: 0.85,
  },
  messageText: {
    color: Colors.text,
  },
  messageTextOnPrimary: {
    color: Colors.background,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  choiceButton: {
    flex: 1,
  },
  waiting: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  waitingText: {
    opacity: 0.7,
  },
  noProfile: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noProfileText: {
    opacity: 0.6,
  },
});

