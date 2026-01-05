/**
 * Block Service - Manages user blocking and reporting
 */

import { supabase } from '../supabase/supabaseClient';

export interface BlockedUser {
  id: string;
  blocked_id: string;
  reason: 'block' | 'report';
  created_at: string;
  // Joined data from profiles
  display_name: string | null;
  city: string | null;
}

/**
 * Block or report a user
 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
  reason: 'block' | 'report'
): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .insert({
      blocker_id: blockerId,
      blocked_id: blockedId,
      reason,
    });

  if (error) {
    // If already blocked, that's fine - just return
    if (error.code === '23505') { // Unique constraint violation
      return;
    }
    console.error('[blockService] Failed to block user:', error);
    throw new Error(`Failed to block user: ${error.message}`);
  }
}

/**
 * Unblock a user
 */
export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) {
    console.error('[blockService] Failed to unblock user:', error);
    throw new Error(`Failed to unblock user: ${error.message}`);
  }
}

/**
 * Get all blocked users for the current user
 * Uses database function to bypass RLS and get display_name reliably
 */
export async function getBlockedUsers(userId: string): Promise<BlockedUser[]> {
  // Use database function to get blocked users with display names
  // This function uses SECURITY DEFINER to bypass RLS and fetch display_name
  const { data, error } = await supabase.rpc('get_blocked_users_with_names', {
    p_blocker_id: userId,
  });

  if (error) {
    console.error('[blockService] Failed to get blocked users:', error);
    throw new Error(`Failed to get blocked users: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Map the function result to BlockedUser interface
  return data.map((item: any) => ({
    id: item.id,
    blocked_id: item.blocked_id,
    reason: item.reason as 'block' | 'report',
    created_at: item.created_at,
    display_name: item.display_name || 'User', // Fallback to "User" if null
    city: item.city || null,
  }));
}

/**
 * Check if a user is blocked (either direction)
 */
export async function isUserBlocked(
  userId1: string,
  userId2: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('id')
    .or(`blocker_id.eq.${userId1},blocked_id.eq.${userId1}`)
    .or(`blocker_id.eq.${userId2},blocked_id.eq.${userId2}`)
    .limit(1);

  if (error) {
    console.error('[blockService] Failed to check if user is blocked:', error);
    return false; // Default to not blocked on error
  }

  return (data?.length || 0) > 0;
}
