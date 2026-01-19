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
import { publicPhotoUrl } from '@/utils/photoUrls';
import storage from '@/services/storage/storage';

/**
 * Builds a public URL for a hero photo from Supabase Storage
 * Returns null if storage path is missing
 * 
 * Note: The bucket_type parameter is kept for backward compatibility but is not used.
 * All photos are stored in the single "photos" bucket.
 * 
 * @deprecated Use publicPhotoUrl from @/utils/photoUrls directly instead
 */
export function buildHeroPhotoUrl(
  bucketType: string | null | undefined,
  storagePath: string | null | undefined
): string | null {
  return publicPhotoUrl(storagePath);
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
export async function getFeedBasic(
  limit: number = 20,
  activeLane: 'pals' | 'match' = 'match'
): Promise<FeedBasicCandidate[]> {
  const { data, error } = await supabase.rpc('get_feed_candidates', {
    p_limit: limit,
    p_cursor_updated_at: null,
    p_cursor_user_id: null,
    p_lane: activeLane,
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
  cursor: FeedCursor | null = null,
  activeLane: 'pals' | 'match' = 'match'
): Promise<{ candidateIds: string[]; nextCursor: FeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_feed_candidates', {
    p_limit: limit,
    p_cursor_updated_at: cursor?.updated_at ?? null,
    p_cursor_user_id: cursor?.user_id ?? null,
    p_lane: activeLane,
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
 * Get feed page with full profile payloads using cursor-based pagination
 * Returns complete profile data and next cursor for queue management
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function getFeedPage(
  limit: number = 10,
  cursor: FeedCursor | null = null,
  activeLane: 'pals' | 'match' = 'match'
): Promise<{ profiles: ProfileViewPayload[]; nextCursor: FeedCursor | null }> {
  const { data, error } = await supabase.rpc('get_feed_page', {
    p_limit: limit,
    p_cursor_updated_at: cursor?.updated_at ?? null,
    p_cursor_user_id: cursor?.user_id ?? null,
    p_lane: activeLane,
  });

  if (error) {
    console.error('[feedService] Failed to get feed page:', error);
    throw new Error(`Failed to get feed page: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { profiles: [], nextCursor: null };
  }

  // Each row: { profile: <json>, cursor_updated_at, cursor_user_id }
  const profiles = data
    .map((row: any) => row.profile)
    .filter(Boolean) as ProfileViewPayload[];

  const lastRow = data[data.length - 1];
  const nextCursor: FeedCursor | null = lastRow
    ? {
        updated_at: lastRow.cursor_updated_at,
        user_id: lastRow.cursor_user_id,
      }
    : null;

  return { profiles, nextCursor };
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
 * Record a reject action
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function recordReject(
  candidateId: string,
  activeLane: 'pals' | 'match',
  crossLaneDays: number = 30
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('record_reject', {
    p_target_id: candidateId,
    p_lane: activeLane,
    p_cross_lane_days: crossLaneDays,
  });

  if (error) {
    console.error('[feedService] record_reject rpc error:', error);
    throw new Error(error.message ?? 'Failed to record reject');
  }

  return (data as { ok: boolean; error?: string }) ?? { ok: true };
}

/**
 * Record a skip action (pass for N days)
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function recordSkip(
  candidateId: string,
  activeLane: 'pals' | 'match',
  skipDays: number = 7
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('record_skip', {
    p_target_id: candidateId,
    p_lane: activeLane,
    p_skip_days: skipDays,
  });

  if (error) {
    console.error('[feedService] record_skip rpc error:', error);
    throw new Error(error.message ?? 'Failed to record skip');
  }

  return (data as { ok: boolean; error?: string }) ?? { ok: true };
}

/**
 * Submit a swipe action (lane-aware)
 * Returns result with remaining accepts count or error
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function submitSwipe(
  candidateId: string,
  action: 'accept' | 'reject' | 'pass',
  lane: 'pals' | 'match'
): Promise<{
  ok: boolean;
  error?: string;
  remaining_accepts?: number | null;
  connection_event?: {
    type: 'mutual' | 'cross_lane_chooser';
    lane?: 'pals' | 'match';
    other_user_id: string;
    conversation_id?: string | null;
  } | null;
}> {
  const { data, error } = await supabase.rpc('submit_swipe', {
    p_candidate_id: candidateId,
    p_action: action,
    p_lane: lane,
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Send a chat request (like + message in one atomic operation)
 * Replaces the two-step process of submitSwipe + sendConnectionRequest
 * This ensures quota is checked consistently in a single transaction
 * 
 * @param targetId - The recipient's user ID
 * @param lane - The active lane ('pals' | 'match')
 * @param body - The message text
 * @param metadata - Optional metadata object (e.g., { photo_id, prompt_id })
 */
export async function sendChatRequest(
  targetId: string,
  lane: Lane,
  body: string,
  metadata?: Record<string, any>,
  clientMessageId?: string
): Promise<{
  ok: boolean;
  conversation_id?: string;
  remaining_accepts?: number | null;
  error?: string;
  limit?: number;
  used?: number;
  cross_lane_pending?: boolean;
  connection_event?: {
    type: 'mutual' | 'cross_lane_chooser';
    lane?: 'pals' | 'match';
    other_user_id: string;
    conversation_id?: string | null;
  } | null;
}> {
  // Generate client message ID if not provided
  const finalClientMessageId = clientMessageId || generateClientMessageId();

  // Validate clientMessageId is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(finalClientMessageId)) {
    const errorMsg = `Invalid clientMessageId: "${finalClientMessageId}". Expected UUID format.`;
    console.error('[feedService] sendChatRequest:', errorMsg);
    throw new Error(errorMsg);
  }

  console.log('[feedService] sendChatRequest calling RPC:', {
    targetId,
    lane,
    bodyLength: body.length,
    bodyPreview: body.substring(0, 50),
    hasMetadata: !!metadata,
    metadataKeys: metadata ? Object.keys(metadata) : [],
    metadataStringified: metadata ? JSON.stringify(metadata) : '{}',
    clientMessageId: finalClientMessageId,
    clientMessageIdValid: uuidRegex.test(finalClientMessageId),
  });

  const { data, error } = await supabase.rpc('send_chat_request', {
    p_target_id: targetId,
    p_lane: lane,
    p_body: body,
    p_metadata: metadata ?? {},
    p_client_message_id: finalClientMessageId,
  });

  if (error) {
    console.error('[feedService] send_chat_request RPC error:', {
      error,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      params: {
        p_target_id: targetId,
        p_lane: lane,
        p_body_length: body.length,
        p_body_preview: body.substring(0, 100),
        p_metadata: metadata,
        p_client_message_id: finalClientMessageId,
      },
    });
    throw new Error(error.message || 'Failed to send chat request');
  }

  // Log the response for debugging
  console.log('[feedService] send_chat_request response:', data);

  // Check if response indicates success
  const result = data as { ok?: boolean; remaining_accepts?: number | null; error?: string; limit?: number; used?: number } | null;

  // Cross-lane pending is a valid outcome: like is recorded, but no conversation/message is created.
  // The match-liker should not see anything yet; we treat this as success so the feed can advance.
  if (result?.error === 'cross_lane_pending') {
    console.warn('[feedService] send_chat_request cross-lane pending: like recorded, awaiting chooser resolution');
    return {
      ok: true,
      remaining_accepts: result?.remaining_accepts,
      cross_lane_pending: true,
    };
  }

  // Quota / expected "soft" errors: let the UI handle them (show upsell, etc.)
  // We return ok:false instead of throwing so callers can branch on result.error.
  if (result?.error === 'daily_limit_reached' || result?.error === 'insufficient_compliments') {
    console.warn('[feedService] send_chat_request quota error:', result.error);
    return {
      ok: false,
      error: result.error,
      remaining_accepts: result?.remaining_accepts,
      limit: result?.limit,
      used: result?.used,
    };
  }

  if (result?.error) {
    console.error('[feedService] send_chat_request returned error:', result.error);
    throw new Error(result.error);
  }

  if (result?.ok === false) {
    console.error('[feedService] send_chat_request returned ok=false:', result);
    throw new Error(result.error || 'Failed to send chat request');
  }

  console.log('[feedService] sendChatRequest completed successfully');
  return result || { ok: true };
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

/**
 * @deprecated Use sendChatRequest instead for likes with messages.
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

export type Lane = 'pals' | 'match';

export type UndoResult = {
  undone_target_id: string;
  action: 'reject' | 'skip';
  lane: Lane;
  undone_at: string;
};

/**
 * Undo the last dislike (reject or skip) for the given lane
 * Uses RPC function with SECURITY DEFINER to bypass RLS
 * Returns the full undo result with target ID, action, lane, and timestamp
 * 
 * @param activeLane - The lane to undo the last dislike from ('pals' | 'match')
 */
export async function undoLastDislike(activeLane: Lane): Promise<UndoResult> {
  const { data, error } = await supabase.rpc('undo_last_dislike', { p_lane: activeLane });

  console.log('[feedService] undo_last_dislike data:', data);
  if (error) {
    console.error('[feedService] undo_last_dislike rpc error:', error);
    throw new Error(error.message ?? 'undo_failed');
  }

  // Supabase returns json as an object. Validate it.
  const result = data as UndoResult | null;
  if (!result?.undone_target_id) {
    console.error('[feedService] undo_last_dislike malformed response:', data);
    throw new Error('undo_failed');
  }

  // Important: RETURN here. Do not fall through to a generic throw.
  return result;
}

/**
 * Undo the last dislike and refresh the feed
 * If refresh fails, the undo still succeeds (doesn't throw)
 * 
 * @param activeLane - The lane to undo the last dislike from
 * @param refreshFeed - Callback function to refresh the feed
 */
export async function undoLastDislikeAndRefresh(
  activeLane: Lane,
  refreshFeed: () => Promise<void>
): Promise<UndoResult> {
  const undo = await undoLastDislike(activeLane);

  try {
    await refreshFeed();
  } catch (e) {
    console.warn('[feedService] undo succeeded but refresh failed:', e);
    // Do NOT throw undo_failed here.
  }

  return undo;
}

/**
 * Reset dislikes for selected lanes
 * Uses auth.uid() internally - no viewerId parameter needed
 */
export async function resetDislikes(lanes: Array<'pals' | 'match'>) {
  const { data, error } = await supabase.rpc('reset_dislikes', {
    p_lanes: lanes,
  });

  if (error) {
    console.error('[feedService] reset_dislikes failed:', error);
    throw new Error(error.message);
  }

  if (!data?.ok) {
    throw new Error(data?.error ?? 'reset_failed');
  }

  return data as { ok: true; updated_count: number; cleanup_deleted: number; lanes: string[] };
}

/**
 * Mark lanes as needing refresh after reset
 * The feed screen will check this flag and clear state for these lanes
 */
export async function markLanesForRefresh(lanes: Array<'pals' | 'match'>): Promise<void> {
  const LANES_TO_REFRESH_KEY = 'lanes_to_refresh_v1';
  
  try {
    await storage.set(LANES_TO_REFRESH_KEY, JSON.stringify(lanes));
    console.log(`[feedService] Marked lanes for refresh: ${lanes.join(', ')}`);
  } catch (error) {
    console.error('[feedService] Failed to mark lanes for refresh:', error);
  }
}

/**
 * Get and clear lanes that need refresh
 * Returns the lanes that were marked, or null if none
 */
export async function getLanesNeedingRefresh(): Promise<Array<'pals' | 'match'> | null> {
  const LANES_TO_REFRESH_KEY = 'lanes_to_refresh_v1';
  
  try {
    const stored = await storage.getString(LANES_TO_REFRESH_KEY);
    if (!stored) return null;
    
    const lanes = JSON.parse(stored) as Array<'pals' | 'match'>;
    
    // Clear the flag immediately
    await storage.delete(LANES_TO_REFRESH_KEY);
    
    return lanes;
  } catch (error) {
    console.error('[feedService] Failed to get lanes needing refresh:', error);
    return null;
  }
}

/**
 * Clear pending dislike events from local outbox for specified lanes
 * This should be called BEFORE resetting dislikes to prevent re-applying suppressions
 */
export async function clearDislikeOutbox(lanes: Array<'pals' | 'match'>): Promise<void> {
  const DISLIKE_OUTBOX_KEY = 'dislike_outbox_v1';
  
  try {
    const stored = await storage.getString(DISLIKE_OUTBOX_KEY);
    if (!stored) {
      console.log('[feedService] No dislike outbox to clear');
      return;
    }

    const outbox = JSON.parse(stored) as Array<{
      eventId: string;
      targetId: string;
      lane: 'pals' | 'match';
      action: 'reject' | 'skip';
      createdAtMs: number;
      commitAfterMs: number;
      crossLaneDays?: number;
      skipDays?: number;
      snapshot: ProfileViewPayload;
      retryCount?: number;
      lastRetryMs?: number;
    }>;

    // Filter out events for the specified lanes
    const filteredOutbox = outbox.filter(event => !lanes.includes(event.lane));

    // Save filtered outbox back to storage
    await storage.set(DISLIKE_OUTBOX_KEY, JSON.stringify(filteredOutbox));

    console.log(
      `[feedService] Cleared ${outbox.length - filteredOutbox.length} dislike events for lanes: ${lanes.join(', ')}`
    );
  } catch (error) {
    console.error('[feedService] Failed to clear dislike outbox:', error);
    // Don't throw - this is a cleanup operation, proceed with reset even if it fails
  }
}
