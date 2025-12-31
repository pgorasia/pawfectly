/**
 * Feed Service - Safe feed queries with lifecycle_status and photo filtering
 * 
 * Feed visibility safety:
 * - Only show profiles with lifecycle_status in ('active','limited')
 * - Only show photos with status='approved'
 * - Never render pending/rejected images for other users
 */

import { supabase } from '../supabase/supabaseClient';

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

