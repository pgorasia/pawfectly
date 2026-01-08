/**
 * Feed Service - Safe feed queries with lifecycle_status and photo filtering
 * 
 * Feed visibility safety:
 * - Only show profiles with lifecycle_status in ('active','limited')
 * - Only show photos with status='approved'
 * - Never render pending/rejected images for other users
 */

import { supabase } from '../supabase/supabaseClient';
import type { ProfileViewPayload, FeedCursor } from '@/types/feed';

/**
 * Builds a public URL for a hero photo from Supabase Storage
 * Returns null if bucket type or storage path is missing
 * This is a pure function that does not make any database calls
 * 
 * Note: The actual storage bucket name is "photos" (not "human" or "dog").
 * The bucket_type field is metadata indicating which type of photo it is.
 */
export function buildHeroPhotoUrl(
  bucketType: string | null | undefined,
  storagePath: string | null | undefined
): string | null {
  if (!storagePath) {
    return null;
  }

  // The actual Supabase Storage bucket is always "photos"
  // bucketType is just metadata (human/dog) but not the bucket name
  const { data } = supabase.storage
    .from('photos')
    .getPublicUrl(storagePath);

  return data?.publicUrl || null;
}

export interface FeedProfile {
  user_id: string;
  display_name: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  lifecycle_status: 'active' | 'limited';
  validation_status: string;
  photos: FeedPhoto[];
  dogs: FeedDog[];
}

export interface FeedPhoto {
  id: string;
  storage_path: string;
  dog_slot: number | null;
  contains_human: boolean;
  contains_dog: boolean;
  status: 'approved'; // Always 'approved' in feed queries
}

export interface FeedDog {
  id: string;
  slot: number;
  name: string;
  breed: string | null;
  size: string;
  energy: string;
}

// FeedCursor is now exported from types/feed.ts

export interface FeedResult {
  profiles: FeedProfile[];
  nextCursor: FeedCursor | null;
}

/**
 * Get feed profiles (only active/limited profiles with approved photos)
 * Uses keyset/cursor pagination for better performance at scale
 */
export async function getFeedProfiles(
  currentUserId: string,
  limit: number = 20,
  cursor: FeedCursor | null = null
): Promise<FeedResult> {
  // Build query with keyset pagination
  let query = supabase
    .from('profiles')
    .select(`
      user_id,
      display_name,
      city,
      latitude,
      longitude,
      lifecycle_status,
      validation_status,
      updated_at
    `)
    .in('lifecycle_status', ['active', 'limited'])
    .neq('user_id', currentUserId); // Exclude current user

  // Apply cursor-based filtering for pagination
  if (cursor) {
    // Keyset pagination: get profiles where:
    // - updated_at < cursor.updated_at, OR
    // - (updated_at = cursor.updated_at AND user_id < cursor.user_id)
    // This ensures consistent ordering and handles ties in updated_at
    // Using PostgREST filter syntax for compound key comparison
    const filter = `updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},user_id.lt.${cursor.user_id})`;
    query = query.or(filter);
  }

  // Order by updated_at DESC, then user_id DESC for consistent pagination
  const { data: profiles, error: profilesError } = await query
    .order('updated_at', { ascending: false })
    .order('user_id', { ascending: false })
    .limit(limit + 1); // Fetch one extra to determine if there's a next page

  if (profilesError) {
    console.error('[feedService] Failed to load profiles:', profilesError);
    throw new Error(`Failed to load profiles: ${profilesError.message}`);
  }

  if (!profiles || profiles.length === 0) {
    return { profiles: [], nextCursor: null };
  }

  // Check if there's a next page (we fetched limit + 1)
  const hasNextPage = profiles.length > limit;
  const profilesToReturn = hasNextPage ? profiles.slice(0, limit) : profiles;

  // Determine next cursor from the last item in the current page
  // Only set cursor if there's a next page and we have results
  const nextCursor: FeedCursor | null =
    hasNextPage && profilesToReturn.length > 0
      ? {
          updated_at: profilesToReturn[profilesToReturn.length - 1].updated_at,
          user_id: profilesToReturn[profilesToReturn.length - 1].user_id,
        }
      : null;

  const userIds = profilesToReturn.map((p) => p.user_id);

  // Query approved photos for these profiles
  const { data: photos, error: photosError } = await supabase
    .from('photos')
    .select('id, user_id, storage_path, dog_slot, contains_human, contains_dog, status')
    .in('user_id', userIds)
    .eq('status', 'approved') // CRITICAL: Only approved photos
    .order('created_at', { ascending: true });

  if (photosError) {
    console.error('[feedService] Failed to load photos:', photosError);
    throw new Error(`Failed to load photos: ${photosError.message}`);
  }

  // Query dogs for these profiles
  const { data: dogs, error: dogsError } = await supabase
    .from('dogs')
    .select('id, user_id, slot, name, breed, size, energy')
    .in('user_id', userIds)
    .eq('is_active', true)
    .order('slot', { ascending: true });

  if (dogsError) {
    console.error('[feedService] Failed to load dogs:', dogsError);
    throw new Error(`Failed to load dogs: ${dogsError.message}`);
  }

  // Group photos and dogs by user_id
  const photosByUser = new Map<string, FeedPhoto[]>();
  const dogsByUser = new Map<string, FeedDog[]>();

  photos?.forEach((photo) => {
    if (!photosByUser.has(photo.user_id)) {
      photosByUser.set(photo.user_id, []);
    }
    photosByUser.get(photo.user_id)!.push({
      id: photo.id,
      storage_path: photo.storage_path,
      dog_slot: photo.dog_slot,
      contains_human: photo.contains_human,
      contains_dog: photo.contains_dog,
      status: 'approved',
    });
  });

  dogs?.forEach((dog) => {
    if (!dogsByUser.has(dog.user_id)) {
      dogsByUser.set(dog.user_id, []);
    }
    dogsByUser.get(dog.user_id)!.push({
      id: dog.id,
      slot: dog.slot,
      name: dog.name,
      breed: dog.breed,
      size: dog.size,
      energy: dog.energy,
    });
  });

  // Combine into feed profiles
  const feedProfiles: FeedProfile[] = profilesToReturn.map((profile) => ({
    user_id: profile.user_id,
    display_name: profile.display_name,
    city: profile.city,
    latitude: profile.latitude,
    longitude: profile.longitude,
    lifecycle_status: profile.lifecycle_status as 'active' | 'limited',
    validation_status: profile.validation_status,
    photos: photosByUser.get(profile.user_id) || [],
    dogs: dogsByUser.get(profile.user_id) || [],
  }));

  return {
    profiles: feedProfiles,
    nextCursor,
  };
}

/**
 * Get current user's profile status for banner display
 */
export async function getCurrentUserStatus(userId: string): Promise<{
  lifecycle_status: string;
  validation_status: string;
} | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('lifecycle_status, validation_status')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('[feedService] Failed to load user status:', error);
    return null;
  }

  return profile;
}

/**
 * MVP Feed Service - Basic feed with swipe actions
 */

export interface FeedBasicCandidate {
  candidate_id: string;
  human_name: string | null;
  city: string | null;
  dog_name: string;
  heroPhotoStoragePath?: string | null;
  heroPhotoBucketType?: string | null;
  heroPhotoId?: string | null;
}

export interface SubmitSwipeResult {
  ok: boolean;
  remaining_accepts?: number | null;
  error?: 'daily_limit_reached' | 'invalid_action' | 'invalid_candidate';
  limit?: number;
  used?: number;
}

/**
 * @deprecated Use getFeedQueue instead. This method is kept for backward compatibility.
 * Get basic feed candidates using RPC function
 * Returns candidates ready for swipe feed display
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function getFeedBasic(limit: number = 20): Promise<FeedBasicCandidate[]> {
  const { data, error } = await supabase.rpc('get_feed_basic', {
    p_limit: limit,
    p_cursor_updated_at: null,
    p_cursor_user_id: null,
  });

  if (error) {
    console.error('[feedService] Failed to get feed basic:', error);
    throw new Error(`Failed to get feed: ${error.message}`);
  }

  // Debug: Log the first row to see what fields are actually returned
  if (data && data.length > 0) {
    console.log('[feedService] Sample RPC response row:', JSON.stringify(data[0], null, 2));
  }

  return (data || []).map((row: any) => {
    const mapped = {
      candidate_id: row.candidate_id,
      human_name: row.human_name,
      city: row.city,
      dog_name: row.dog_name || '',
      // Try both snake_case and camelCase field names
      heroPhotoStoragePath: row.hero_photo_storage_path ?? row.heroPhotoStoragePath ?? null,
      heroPhotoBucketType: row.hero_photo_bucket_type ?? row.heroPhotoBucketType ?? null,
      heroPhotoId: row.hero_photo_id ?? row.heroPhotoId ?? null,
    };
    
    // Debug: Log if we found hero photo data
    if (mapped.heroPhotoStoragePath || mapped.heroPhotoBucketType) {
      console.log('[feedService] Found hero photo data:', {
        storagePath: mapped.heroPhotoStoragePath,
        bucketType: mapped.heroPhotoBucketType,
        photoId: mapped.heroPhotoId,
      });
    }
    
    return mapped;
  });
}

/**
 * Get feed queue using cursor-based pagination
 * Returns candidate IDs and next cursor for queue management
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function getFeedQueue(
  limit: number = 10,
  cursor: FeedCursor | null = null
): Promise<{ candidateIds: string[]; nextCursor: FeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_feed_basic', {
    p_limit: limit,
    p_cursor_updated_at: cursor?.updated_at ?? null,
    p_cursor_user_id: cursor?.user_id ?? null,
  });

  if (error) {
    console.error('[feedService] Failed to get feed queue:', error);
    throw new Error(`Failed to get feed queue: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { candidateIds: [], nextCursor: null };
  }

  const candidateIds = data.map((row: any) => row.candidate_id);
  
  // Determine next cursor from the last row
  const lastRow = data[data.length - 1];
  const nextCursor: FeedCursor | null = lastRow
    ? {
        updated_at: lastRow.cursor_updated_at ?? lastRow.updated_at,
        user_id: lastRow.cursor_user_id ?? lastRow.candidate_id,
      }
    : null;

  return { candidateIds, nextCursor };
}

/**
 * Get full profile view for a candidate
 * Returns complete profile data including dogs, photos, prompts, and compatibility
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function getProfileView(candidateId: string): Promise<ProfileViewPayload> {
  const { data, error } = await supabase.rpc('get_profile_view', {
    p_candidate_id: candidateId,
  });

  if (error) {
    console.error('[feedService] Failed to get profile view:', error);
    throw new Error(`Failed to get profile view: ${error.message}`);
  }

  if (!data) {
    throw new Error('No profile data returned');
  }

  return data as ProfileViewPayload;
}

/**
 * Submit a swipe action (reject, pass, or accept)
 * Returns result with remaining accepts count or error
 * Uses auth.uid() internally - no viewerId parameter needed
 * 
 * @deprecated The old signature with viewerId is deprecated. This method now only takes candidateId and action.
 */
export async function submitSwipe(
  candidateId: string,
  action: 'reject' | 'pass' | 'accept'
): Promise<SubmitSwipeResult> {
  const { data, error } = await supabase.rpc('submit_swipe', {
    p_candidate_id: candidateId,
    p_action: action,
  });

  if (error) {
    console.error('[feedService] Failed to submit swipe:', error);
    throw new Error(`Failed to submit swipe: ${error.message}`);
  }

  return data as SubmitSwipeResult;
}

/**
 * Send a connection request with optional compliment message
 * Uses auth.uid() internally - no viewerId parameter needed
 * 
 * @param candidateId - The recipient's user ID
 * @param sourceType - Either 'photo' or 'prompt'
 * @param sourceRefId - The photo ID if sourceType is 'photo', or prompt answer ID if sourceType is 'prompt'
 * @param message - Optional compliment message
 */
export async function sendConnectionRequest(
  candidateId: string,
  sourceType: 'photo' | 'prompt',
  sourceRefId: string,
  message: string | null = null
): Promise<{ ok: boolean; error?: string }> {
  // Map parameters to match SQL function signature:
  // p_recipient_id, p_context_type, p_context_photo_id, p_context_prompt_answer_id, p_message
  const params: {
    p_recipient_id: string;
    p_context_type: string;
    p_context_photo_id?: string | null;
    p_context_prompt_answer_id?: string | null;
    p_message?: string | null;
  } = {
    p_recipient_id: candidateId,
    p_context_type: sourceType,
  };

  // Set the appropriate context ID based on source type
  if (sourceType === 'photo') {
    params.p_context_photo_id = sourceRefId;
    params.p_context_prompt_answer_id = null;
  } else if (sourceType === 'prompt') {
    params.p_context_photo_id = null;
    params.p_context_prompt_answer_id = sourceRefId;
  }

  // Add message if provided
  if (message !== null) {
    params.p_message = message;
  }

  const { data, error } = await supabase.rpc('send_connection_request', params);

  if (error) {
    console.error('[feedService] Failed to send connection request:', error);
    throw new Error(`Failed to send connection request: ${error.message}`);
  }

  return data as { ok: boolean; error?: string };
}

/**
 * Undo the last reject swipe (delete the most recent reject swipe)
 * Uses RPC function with SECURITY DEFINER to bypass RLS
 * Returns the candidate_id that was undone so UI can re-insert the card
 */
export async function undoSwipe(): Promise<string | null> {
  const { data, error } = await supabase.rpc('undo_last_reject');

  if (error) {
    console.error('[feedService] Failed to undo swipe:', error);
    throw new Error(`Failed to undo swipe: ${error.message}`);
  }

  if (!data?.ok) {
    const errorMsg = data?.error ?? 'undo_failed';
    console.error('[feedService] Undo failed:', errorMsg);
    throw new Error(`Failed to undo swipe: ${errorMsg}`);
  }

  return data.candidate_id || null;
}

/**
 * Undo the last pass swipe (delete the most recent pass swipe)
 * Uses RPC function with SECURITY DEFINER to bypass RLS
 * Returns the candidate_id that was undone so UI can re-insert the card
 */
export async function undoPassSwipe(): Promise<string | null> {
  const { data, error } = await supabase.rpc('undo_last_pass');

  if (error) {
    console.error('[feedService] Failed to undo pass swipe:', error);
    throw new Error(`Failed to undo pass swipe: ${error.message}`);
  }

  if (!data?.ok) {
    const errorMsg = data?.error ?? 'undo_failed';
    console.error('[feedService] Undo pass failed:', errorMsg);
    throw new Error(`Failed to undo pass swipe: ${errorMsg}`);
  }

  return data.candidate_id ?? null;
}
