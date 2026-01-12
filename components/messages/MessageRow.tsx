import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { LaneBadge } from './LaneBadge';
import { toPublicPhotoUrl, type Thread } from '@/services/messages/messagesService';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface MessageRowProps {
  thread: Thread;
  onPress: () => void;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MessageRow({ thread, onPress }: MessageRowProps) {
  const photoUrl = toPublicPhotoUrl(thread.hero_storage_path);
  const hasUnread = thread.unread_count > 0;
  
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarContainer}>
        {photoUrl ? (
          <Image 
            source={{ uri: photoUrl }} 
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <AppText variant="body" style={styles.avatarText}>
              {thread.display_name?.[0]?.toUpperCase() || '?'}
            </AppText>
          </View>
        )}
        <View style={styles.badgeContainer}>
          <LaneBadge lane={thread.lane} />
        </View>
      </View>
      
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.nameContainer}>
            <AppText variant="body" style={[styles.name, hasUnread && styles.unreadText]}>
              {thread.display_name}
            </AppText>
            <LaneBadge lane={thread.lane} style={styles.badge} />
          </View>
          <AppText variant="caption" style={styles.time}>
            {formatTimeAgo(thread.last_message_at)}
          </AppText>
        </View>
        
        <View style={styles.previewRow}>
          <AppText 
            variant="caption" 
            style={[styles.preview, hasUnread && styles.unreadText]} 
            numberOfLines={1}
          >
            {thread.preview || 'No messages yet'}
          </AppText>
          {hasUnread && (
            <View style={styles.unreadBadge}>
              <AppText variant="caption" style={styles.unreadBadgeText}>
                {thread.unread_count}
              </AppText>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  badgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 2,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  badge: {
    marginLeft: Spacing.xs,
  },
  time: {
    fontSize: 13,
    color: Colors.text,
    opacity: 0.6,
    marginLeft: Spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preview: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    opacity: 0.7,
  },
  unreadText: {
    fontWeight: '600',
    opacity: 1,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  unreadBadgeText: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: '700',
  },
});
