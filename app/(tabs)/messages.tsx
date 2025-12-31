import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { useMe } from '@/contexts/MeContext';
import { useAuth } from '@/contexts/AuthContext';
import { ConnectionStyle } from '@/hooks/useProfileDraft';
import { supabase } from '@/services/supabase/supabaseClient';
import { dbPreferencesToDraftPreferences } from '@/services/supabase/onboardingService';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

// Mock data - in production, this would come from Supabase
interface Match {
  id: string;
  name: string;
  profilePic: string | null;
  connectionStyle: ConnectionStyle;
}

interface Message {
  id: string;
  matchId: string;
  name: string;
  profilePic: string | null;
  lastMessage: string;
  lastMessageTime: Date;
  connectionStyle: ConnectionStyle;
}

const MOCK_MATCHES_PAWSOME: Match[] = [
  { id: '1', name: 'Alex', profilePic: null, connectionStyle: 'pawsome-pals' },
  { id: '2', name: 'Jordan', profilePic: null, connectionStyle: 'pawsome-pals' },
];

const MOCK_MATCHES_PAWFECT: Match[] = [
  { id: '3', name: 'Sam', profilePic: null, connectionStyle: 'pawfect-match' },
];

const MOCK_MESSAGES_PAWSOME: Message[] = [
  {
    id: '1',
    matchId: '1',
    name: 'Taylor',
    profilePic: null,
    lastMessage: 'Hey! How are you?',
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    connectionStyle: 'pawsome-pals',
  },
];

const MOCK_MESSAGES_PAWFECT: Message[] = [
  {
    id: '2',
    matchId: '2',
    name: 'Casey',
    profilePic: null,
    lastMessage: 'Great to match with you!',
    lastMessageTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    connectionStyle: 'pawfect-match',
  },
];

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function MatchItem({ match }: { match: Match }) {
  return (
    <TouchableOpacity style={styles.matchItem}>
      <View style={styles.matchAvatar}>
        <AppText variant="heading" style={styles.matchAvatarText}>
          {match.name[0]}
        </AppText>
      </View>
      <AppText variant="caption" style={styles.matchName} numberOfLines={1}>
        {match.name}
      </AppText>
    </TouchableOpacity>
  );
}

function MessageItem({ message }: { message: Message }) {
  return (
    <TouchableOpacity style={styles.messageItem}>
      <View style={styles.messageAvatar}>
        <AppText variant="heading" style={styles.messageAvatarText}>
          {message.name[0]}
        </AppText>
      </View>
      <View style={styles.messageContent}>
        <View style={styles.messageHeader}>
          <AppText variant="body" style={styles.messageName}>
            {message.name}
          </AppText>
          <AppText variant="caption" style={styles.messageTime}>
            {formatTimeAgo(message.lastMessageTime)}
          </AppText>
        </View>
        <AppText variant="caption" style={styles.messagePreview} numberOfLines={1}>
          {message.lastMessage}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

function MessagesTab({ connectionStyle }: { connectionStyle: ConnectionStyle }) {
  const isPawsome = connectionStyle === 'pawsome-pals';
  
  // Filter matches - only show those without an active chat
  const matches = isPawsome ? MOCK_MATCHES_PAWSOME : MOCK_MATCHES_PAWFECT;
  const messages = isPawsome ? MOCK_MESSAGES_PAWSOME : MOCK_MESSAGES_PAWFECT;
  
  // Filter out matches that already have messages
  const matchIdsWithMessages = new Set(messages.map((m) => m.matchId));
  const newMatches = matches.filter((m) => !matchIdsWithMessages.has(m.id));

  return (
    <View style={styles.tabContent}>
      {/* Matches Section */}
      {newMatches.length > 0 && (
        <View style={styles.section}>
          <AppText variant="body" style={styles.sectionTitle}>
            Matches
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.matchesContainer}
          >
            {newMatches.map((match) => (
              <MatchItem key={match.id} match={match} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Messages Section */}
      <View style={styles.section}>
        <AppText variant="body" style={styles.sectionTitle}>
          Messages
        </AppText>
        {messages.length > 0 ? (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <MessageItem message={item} />}
            scrollEnabled={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <AppText variant="body" style={styles.emptyStateText}>
              No messages yet
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

export default function MessagesScreen() {
  const { me, updateMe } = useMe();
  const { user } = useAuth();
  const hasPawsomePals = me.connectionStyles.includes('pawsome-pals');
  const hasPawfectMatch = me.connectionStyles.includes('pawfect-match');
  
  const [activeTab, setActiveTab] = useState<ConnectionStyle | null>(
    hasPawsomePals ? 'pawsome-pals' : hasPawfectMatch ? 'pawfect-match' : null
  );

  // Update activeTab when connection styles change
  useEffect(() => {
    if (hasPawsomePals) {
      setActiveTab('pawsome-pals');
    } else if (hasPawfectMatch) {
      setActiveTab('pawfect-match');
    } else {
      setActiveTab(null);
    }
  }, [hasPawsomePals, hasPawfectMatch]);

  // Reconciliation: Sync MeContext with database on focus to reflect latest preferences
  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id) return;

      const reconcilePreferences = async () => {
        try {
          // Fetch latest preferences from database
          const { data: prefs, error } = await supabase
            .from('preferences')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          if (error && error.code !== 'PGRST116') {
            console.error('[MessagesScreen] Failed to reconcile preferences:', error);
            return;
          }

          if (prefs) {
            // Convert DB format to Me format
            const { connectionStyles, preferences: prefsData } = dbPreferencesToDraftPreferences(prefs);
            
            // Always update to ensure MeContext reflects latest DB state
            // updateMe will handle efficient updates internally
            updateMe({
              connectionStyles,
              preferences: prefsData,
            });
          }
        } catch (error) {
          console.error('[MessagesScreen] Error reconciling preferences:', error);
        }
      };

      reconcilePreferences();
    }, [user?.id, updateMe])
  );

  // If only one connection style, show it directly
  if (!hasPawsomePals && !hasPawfectMatch) {
    return (
      <ScreenContainer>
        <View style={styles.emptyContainer}>
          <AppText variant="heading" style={styles.emptyTitle}>
            No Connection Styles
          </AppText>
          <AppText variant="body" style={styles.emptySubtitle}>
            Please set up your connection preferences first.
          </AppText>
        </View>
      </ScreenContainer>
    );
  }

  if (hasPawsomePals && !hasPawfectMatch) {
    return (
      <ScreenContainer>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <MessagesTab connectionStyle="pawsome-pals" />
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (!hasPawsomePals && hasPawfectMatch) {
    return (
      <ScreenContainer>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <MessagesTab connectionStyle="pawfect-match" />
        </ScrollView>
      </ScreenContainer>
    );
  }

  // Both connection styles - show tabs
  return (
    <ScreenContainer>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pawsome-pals' && styles.tabActive]}
          onPress={() => setActiveTab('pawsome-pals')}
        >
          <AppText
            variant="body"
            style={[
              styles.tabText,
              activeTab === 'pawsome-pals' && styles.tabTextActive,
            ]}
          >
            🐾 Pawsome Pals
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pawfect-match' && styles.tabActive]}
          onPress={() => setActiveTab('pawfect-match')}
        >
          <AppText
            variant="body"
            style={[
              styles.tabText,
              activeTab === 'pawfect-match' && styles.tabTextActive,
            ]}
          >
            💛 Pawfect Match
          </AppText>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {activeTab && <MessagesTab connectionStyle={activeTab} />}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
    paddingHorizontal: Spacing.lg,
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
  tabContent: {
    flex: 1,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  matchesContainer: {
    gap: Spacing.md,
    paddingRight: Spacing.lg,
  },
  matchItem: {
    alignItems: 'center',
    marginRight: Spacing.md,
    width: 80,
  },
  matchAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  matchAvatarText: {
    color: Colors.background,
    fontSize: 20,
  },
  matchName: {
    textAlign: 'center',
    fontSize: 12,
  },
  messageItem: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  messageAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  messageAvatarText: {
    color: Colors.background,
    fontSize: 18,
  },
  messageContent: {
    flex: 1,
    justifyContent: 'center',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  messageName: {
    fontWeight: '600',
  },
  messageTime: {
    opacity: 0.6,
  },
  messagePreview: {
    opacity: 0.7,
  },
  emptyState: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    opacity: 0.5,
  },
});
