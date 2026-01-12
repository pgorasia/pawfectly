/**
 * Badge Service
 * Manages trust badges and verification status
 */

import { supabase } from '../supabase/supabaseClient';
import type { Photo } from '@/types/photo';

export type BadgeType = 'email_verified' | 'photo_with_dog' | 'selfie_verified';

export interface BadgeStatus {
  type: BadgeType;
  earned: boolean;
  earnedAt: string | null;
  metadata: Record<string, any> | null;
}

export interface SelfieVerificationAttemptResult {
  allowed: boolean;
  remaining_hourly: number;
  remaining_daily: number;
  retry_after_seconds: number | null;
}

/**
 * Get all badge statuses for the current user
 */
export async function getBadgeStatuses(): Promise<BadgeStatus[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Fetch all badges from trust_badges table (only earned badges)
  const { data: badges, error: badgesError } = await supabase
    .from('trust_badges')
    .select('badge_type, earned_at, metadata, status')
    .eq('user_id', user.id)
    .eq('status', 'earned'); // Only fetch earned badges

  if (badgesError) {
    console.error('[badgeService] Failed to fetch badges:', badgesError);
    throw new Error(`Failed to fetch badges: ${badgesError.message}`);
  }

  // Fetch profile for selfie verification status
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('selfie_verified_at, selfie_verified_photo_id')
    .eq('user_id', user.id)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('[badgeService] Failed to fetch profile:', profileError);
  }

  // Fetch photos to check for photo_with_dog badge
  const { data: photos, error: photosError } = await supabase
    .from('photos')
    .select('contains_dog, contains_human, status')
    .eq('user_id', user.id)
    .eq('status', 'approved');

  if (photosError) {
    console.error('[badgeService] Failed to fetch photos:', photosError);
  }

  // Build badge statuses
  const badgeMap = new Map<string, BadgeStatus>();

  // Email verified - always true (will be implemented later with OTP)
  badgeMap.set('email_verified', {
    type: 'email_verified',
    earned: true, // TODO: Check auth.users.email_confirmed_at when OTP is implemented
    earnedAt: null,
    metadata: null,
  });

  // Photo with dog - check trust_badges table (badge is auto-awarded by trigger)
  const photoWithDogBadge = badges?.find(b => b.badge_type === 'photo_with_dog');
  badgeMap.set('photo_with_dog', {
    type: 'photo_with_dog',
    earned: !!photoWithDogBadge,
    earnedAt: photoWithDogBadge?.earned_at || null,
    metadata: photoWithDogBadge?.metadata || null,
  });

  // Selfie verified - check profile and trust_badges
  const selfieBadge = badges?.find(b => b.badge_type === 'selfie_verified');
  const isSelfieVerified = profile?.selfie_verified_at !== null;
  badgeMap.set('selfie_verified', {
    type: 'selfie_verified',
    earned: isSelfieVerified,
    earnedAt: profile?.selfie_verified_at || selfieBadge?.earned_at || null,
    metadata: selfieBadge?.metadata || (profile?.selfie_verified_photo_id ? { verified_photo_id: profile.selfie_verified_photo_id } : null),
  });

  return Array.from(badgeMap.values());
}

/**
 * Get a specific badge status
 */
export async function getBadgeStatus(type: BadgeType): Promise<BadgeStatus | null> {
  const badges = await getBadgeStatuses();
  return badges.find(b => b.type === type) || null;
}

/**
 * Check if user can attempt selfie verification (rate limiting)
 * This function INCREMENTS the attempt count - call it only when actually attempting verification
 */
export async function canAttemptSelfieVerification(): Promise<SelfieVerificationAttemptResult> {
  const { data, error } = await supabase.rpc('can_attempt_selfie_verification');

  if (error) {
    console.error('[badgeService] Failed to check selfie verification attempts:', error);
    throw new Error(`Failed to check attempts: ${error.message}`);
  }

  return data as SelfieVerificationAttemptResult;
}

/**
 * Check selfie verification limits without incrementing attempt count
 * Use this to check limits before starting the flow
 */
export async function checkSelfieVerificationLimits(): Promise<SelfieVerificationAttemptResult> {
  const { data, error } = await supabase.rpc('check_selfie_verification_limits');

  if (error) {
    console.error('[badgeService] Failed to check selfie verification limits:', error);
    throw new Error(`Failed to check limits: ${error.message}`);
  }

  return data as SelfieVerificationAttemptResult;
}

/**
 * Get eligible human photos for selfie verification
 * Returns approved photos that contain humans
 */
export async function getEligibleHumanPhotos(): Promise<Photo[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data: photos, error } = await supabase
    .from('photos')
    .select('*')
    .eq('user_id', user.id)
    .eq('bucket_type', 'human')
    .eq('contains_human', true)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[badgeService] Failed to fetch eligible photos:', error);
    throw new Error(`Failed to fetch photos: ${error.message}`);
  }

  return photos || [];
}

/**
 * Complete selfie verification
 * Updates profile and trust_badges with verification result
 */
export async function completeSelfieVerification(
  verifiedPhotoId: string,
  method: string = 'on_device_v1'
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Verify the photo exists and belongs to the user
  const { data: photo, error: photoError } = await supabase
    .from('photos')
    .select('id, user_id, bucket_type, contains_human, status')
    .eq('id', verifiedPhotoId)
    .eq('user_id', user.id)
    .single();

  if (photoError || !photo) {
    throw new Error('Photo not found or does not belong to user');
  }

  if (photo.bucket_type !== 'human' || !photo.contains_human || photo.status !== 'approved') {
    throw new Error('Photo is not eligible for verification');
  }

  const now = new Date().toISOString();

  // Update profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      selfie_verified_at: now,
      selfie_verified_method: method,
      selfie_verified_photo_id: verifiedPhotoId,
      updated_at: now,
    })
    .eq('user_id', user.id);

  if (profileError) {
    console.error('[badgeService] Failed to update profile:', profileError);
    throw new Error(`Failed to update profile: ${profileError.message}`);
  }

  // Upsert badge in trust_badges
  const { error: badgeError } = await supabase
    .from('trust_badges')
    .upsert({
      user_id: user.id,
      badge_type: 'selfie_verified',
      earned_at: now,
      status: 'earned',
      revoked_at: null,
      metadata: {
        verified_photo_id: verifiedPhotoId,
        method: method,
      },
    }, {
      onConflict: 'user_id,badge_type',
    });

  if (badgeError) {
    console.error('[badgeService] Failed to create badge:', badgeError);
    // Don't throw - profile update succeeded, badge is secondary
    console.warn('[badgeService] Badge creation failed but profile was updated');
  }
}

/**
 * Check if a specific photo is the verified photo
 */
export async function isPhotoVerified(photoId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('selfie_verified_photo_id')
    .eq('user_id', user.id)
    .single();

  if (error || !profile) {
    return false;
  }

  return profile.selfie_verified_photo_id === photoId;
}
