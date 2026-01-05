/**
 * Feed Service - Safe feed queries with lifecycle_status and photo filtering
 * 
 * Feed visibility safety:
 * - Only show profiles with lifecycle_status in ('active','limited')
 * - Only show photos with status='approved'
 * - Never render pending/rejected images for other users
 */

import { supabase } from '../supabase/supabaseClient';

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
  lat: number | null;
  lng: number | null;
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

export interface FeedCursor {
  updated_at: string;
  user_id: string;
}

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
      lat,
      lng,
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
    lat: profile.lat,
    lng: profile.lng,
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
 * Get basic feed candidates using RPC function
 * Returns candidates ready for swipe feed display
 */
export async function getFeedBasic(viewerId: string, limit: number = 20): Promise<FeedBasicCandidate[]> {
  const { data, error } = await supabase.rpc('get_feed_basic', {
    p_viewer_id: viewerId,
    p_limit: limit,
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
 * Submit a swipe action (reject, pass, or accept)
 * Returns result with remaining accepts count or error
 */
export async function submitSwipe(
  viewerId: string,
  candidateId: string,
  action: 'reject' | 'pass' | 'accept'
): Promise<SubmitSwipeResult> {
  const { data, error } = await supabase.rpc('submit_swipe', {
    p_viewer_id: viewerId,
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
