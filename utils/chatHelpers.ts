/**
 * Chat Helper Utilities
 */

import type { Match, Thread } from '@/services/messages/messagesService';

/**
 * Truncate message preview to max length with ellipsis
 */
export function truncatePreview(text: string, maxLength: number = 50): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Format elapsed time for chat UI (e.g., "30m", "4h", "2d")
 */
export function formatElapsedTime(dateString: string): string {
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

/**
 * Derive peer user info from conversation based on current user
 * Assumes conversation has user_low and user_high IDs, or uses Match data
 */
export function derivePeerFromMatch(match: Match, currentUserId: string): {
  peerId: string;
  peerName: string;
  peerPhotoUrl: string | null;
} {
  return {
    peerId: match.user_id,
    peerName: match.display_name,
    peerPhotoUrl: match.thumb_storage_path ?? match.hero_storage_path,
  };
}

/**
 * Check if thread/conversation has any messages
 */
export function hasMessages(thread: Thread): boolean {
  return thread.last_message_at != null && thread.last_message_at !== '';
}

/**
 * Convert Match to Thread format for optimistic updates
 */
export function matchToThread(
  match: Match,
  messageText: string,
  currentUserId: string
): Thread {
  return {
    conversation_id: `temp-${match.user_id}`, // Will be replaced with real ID
    user_id: match.user_id,
    lane: match.lane,
    last_message_at: new Date().toISOString(),
    preview: truncatePreview(messageText),
    unread_count: 0, // We sent it, so unread = 0
    display_name: match.display_name,
    dog_name: match.dog_name,
    hero_storage_path: match.hero_storage_path,
  };
}
