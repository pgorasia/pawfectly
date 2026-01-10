/**
 * Photo URL Utilities
 * Standardized helpers for constructing Supabase Storage URLs
 * 
 * All photos are stored in a single 'photos' bucket.
 * This approach is more efficient than using supabase.storage.getPublicUrl()
 * as it constructs the URL directly without an API call.
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const PHOTOS_BUCKET = 'photos';

/**
 * Build public URL for a photo in the 'photos' bucket
 * Returns null if storage path is missing or Supabase URL is not configured
 * 
 * @param storagePath - The storage path of the photo (e.g., "user123/photo456.jpg")
 * @returns Public URL string or null
 * 
 * @example
 * const url = publicPhotoUrl("user123/photo456.jpg");
 * // Returns: "https://your-project.supabase.co/storage/v1/object/public/photos/user123/photo456.jpg"
 */
export function publicPhotoUrl(storagePath: string | null | undefined): string | null {
  if (!storagePath) {
    return null;
  }

  if (!SUPABASE_URL) {
    console.warn('[photoUrls] EXPO_PUBLIC_SUPABASE_URL is not configured');
    return null;
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTOS_BUCKET}/${storagePath}`;
}
