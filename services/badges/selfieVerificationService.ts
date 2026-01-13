/**
 * Selfie Verification (Phase 1)
 *
 * Production-grade approach for an MVP:
 * - User submits a selfie + a reference profile photo.
 * - We create a verification request (status: pending) and store the selfie in a PRIVATE bucket.
 * - An admin/service-role process reviews and approves/rejects.
 *
 * Phase 2 (later): On-device embeddings + liveness/anti-spoofing can be layered in without changing
 * the user-facing API contract. The DB request table remains the system of record.
 */

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/services/supabase/supabaseClient';
import { getCurrentUserId } from '@/services/supabase/photoService';

export type SelfieVerificationRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface SelfieVerificationRequest {
  id: string;
  user_id: string;
  reference_photo_id: string | null;
  status: SelfieVerificationRequestStatus;
  submitted_at: string;
  reviewed_at: string | null;
  review_reason: string | null;
}

/**
 * Convert an image URI to Uint8Array (works in Expo Go).
 * Matches the approach used in resizeAndUploadPhoto.ts to avoid blob issues on Android.
 */
async function imageUriToUint8Array(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Failed to read image: ${response.statusText}`);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup: number[] = new Array(256).fill(-1);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  let bufferLength = base64.length * 0.75;
  if (base64.length > 0) {
    if (base64[base64.length - 1] === '=') {
      bufferLength--;
      if (base64.length > 1 && base64[base64.length - 2] === '=') bufferLength--;
    }
  }

  const bytes = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    if (encoded3 !== -1) bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    if (encoded4 !== -1) bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
  }

  return bytes;
}

function pickResize(width: number, height: number, maxLongEdge = 768): { width: number; height: number } | null {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return null;

  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

export async function getLatestSelfieVerificationRequest(): Promise<SelfieVerificationRequest | null> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from('selfie_verification_requests')
    .select('id,user_id,reference_photo_id,status,submitted_at,reviewed_at,review_reason')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // If the table doesn't exist yet (older DB), fail silently to avoid blocking other work
    console.warn('[selfieVerificationService] getLatestSelfieVerificationRequest error:', error.message);
    return null;
  }

  return (data as any) ?? null;
}

export async function submitSelfieVerificationRequest(params: {
  referencePhotoId: string;
  selfieUri: string;
  selfieWidth?: number;
  selfieHeight?: number;
  metadata?: Record<string, any>;
}): Promise<{ ok: true; requestId: string; status: SelfieVerificationRequestStatus } | { ok: false; error: string }> {
  const userId = await getCurrentUserId();
  const requestId = Crypto.randomUUID();
  const storagePath = `users/${userId}/requests/${requestId}.jpg`;

  // Resize + compress selfie to keep uploads small without degrading face detail.
  // 768px long edge is a solid balance for cross-platform review.
  const actions: any[] = [];
  if (typeof params.selfieWidth === 'number' && typeof params.selfieHeight === 'number') {
    const resize = pickResize(params.selfieWidth, params.selfieHeight, 768);
    if (resize) actions.push({ resize });
  }

  const manipulated = await manipulateAsync(params.selfieUri, actions, {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });

  const bytes = await imageUriToUint8Array(manipulated.uri);

  // 1) Upload selfie to private storage bucket
  const { error: uploadError } = await supabase.storage
    .from('selfie_verifications')
    .upload(storagePath, bytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (uploadError) {
    if (uploadError.message?.toLowerCase().includes('bucket')) {
      return {
        ok: false,
        error:
          'Storage bucket "selfie_verifications" not found. Create it in Supabase Dashboard → Storage (private), or extend scripts/supabase/create-storage-bucket.js to create it.',
      };
    }
    return { ok: false, error: `Failed to upload selfie: ${uploadError.message}` };
  }

  // 2) Create verification request (attempt counting + validation happens server-side)
  const { data, error: rpcError } = await supabase.rpc('submit_selfie_verification_request', {
    p_reference_photo_id: params.referencePhotoId,
    p_selfie_storage_path: storagePath,
    p_metadata: params.metadata ?? {},
  });

  if (rpcError) {
    // Avoid orphan objects on server-side failures
    supabase.storage.from('selfie_verifications').remove([storagePath]).catch(() => undefined);
    return { ok: false, error: rpcError.message };
  }

  const payload = data as any;
  if (!payload || payload.ok !== true) {
    supabase.storage.from('selfie_verifications').remove([storagePath]).catch(() => undefined);
    return { ok: false, error: payload?.error ?? 'Unable to submit verification request.' };
  }

  return { ok: true, requestId: payload.request_id ?? requestId, status: payload.status ?? 'pending' };
}
