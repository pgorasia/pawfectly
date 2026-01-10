/**
 * Liked You Service - Fetch profiles that have liked the current user
 * 
 * Uses cursor-based pagination to efficiently load "Liked You" cards
 * showing users who have sent connection requests or expressed interest
 */

import { supabase } from '../supabase/supabaseClient';
import { publicPhotoUrl } from '@/utils/photoUrls';

/**
 * Cursor for paginating through liked you results
 * Uses liked_at timestamp and liker_id for keyset pagination
 */
export type LikedYouCursor = { 
  liked_at: string; 
  liker_id: string;
};

/**
 * Card data for a user who has liked you
 * Contains basic profile info and hero photo for display
 */
export type LikedYouCard = {
  liker_id: string;
  liked_at: string;
  display_name: string | null;
  city: string | null;
  dog_name: string | null;
  hero_photo_storage_path: string | null;
  hero_photo_bucket_type: string | null;
  hero_photo_id: string | null;
};

/**
 * Get a paginated page of users who have liked you
 * Uses cursor-based pagination for efficient scrolling through large lists
 * 
 * @param limit - Number of cards to fetch (default: 20)
 * @param cursor - Pagination cursor from previous page (null for first page)
 * @returns Object with rows array and nextCursor for pagination
 * 
 * @example
 * // First page
 * const { rows, nextCursor } = await getLikedYouPage(20);
 * 
 * // Next page
 * const { rows: moreRows, nextCursor: cursor2 } = await getLikedYouPage(20, nextCursor);
 */
export async function getLikedYouPage(
  limit: number = 20,
  cursor: LikedYouCursor | null = null
): Promise<{ rows: LikedYouCard[]; nextCursor: LikedYouCursor | null }> {
  const { data, error } = await supabase.rpc('get_liked_you_page', {
    p_limit: limit,
    p_cursor_liked_at: cursor?.liked_at ?? null,
    p_cursor_liker_id: cursor?.liker_id ?? null,
  });

  if (error) {
    console.error('[likedYouService] Failed to get liked you page:', error);
    throw new Error(`Failed to get liked you page: ${error.message}`);
  }

  const rows = (data ?? []) as LikedYouCard[];
  
  if (rows.length === 0) {
    return { rows: [], nextCursor: null };
  }

  // Create cursor from the last item for next page
  const last = rows[rows.length - 1];
  const nextCursor: LikedYouCursor = {
    liked_at: last.liked_at,
    liker_id: last.liker_id,
  };

  return {
    rows,
    nextCursor,
  };
}

/**
 * Build public URL for hero photo
 * Helper function to generate Supabase Storage URLs
 * 
 * @param storagePath - The storage path from the LikedYouCard
 * @returns Public URL string or null if path is missing
 * @deprecated Use publicPhotoUrl from @/utils/photoUrls instead
 */
export function buildLikedYouPhotoUrl(storagePath: string | null | undefined): string | null {
  return publicPhotoUrl(storagePath);
}
