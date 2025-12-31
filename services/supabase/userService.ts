/**
 * User service for profile and live status checks
 */

import { supabase } from './supabaseClient';

/**
 * Checks if a user is "live" (can appear in feeds)
 * Uses the is_user_live SQL function
 */
export async function isUserLive(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_user_live', {
    check_user_id: userId,
  });

  if (error) {
    console.error('[UserService] Error checking user live status:', error);
    throw new Error(`Failed to check user live status: ${error.message}`);
  }

  return data === true;
}

