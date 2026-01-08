/**
 * Account Settings Service
 * Handles account-related operations like profile deletion
 */

import { supabase } from '../supabase/supabaseClient';

/**
 * Request profile deletion (soft delete)
 * Calls RPC function to set deleted_at and hide the profile
 * @param reason - Optional reason for deletion
 * @throws Error if deletion fails
 */
export async function requestDeleteProfile(reason?: string): Promise<void> {
  const { data, error } = await supabase.rpc('request_delete_profile', {
    p_reason: reason ?? null,
  });

  if (error) {
    console.error('[settingsService] Failed to request profile deletion:', error);
    throw new Error(error.message);
  }

  if (!data?.ok) {
    const errorMsg = data?.error ?? 'delete_failed';
    console.error('[settingsService] Profile deletion failed:', errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Delete account permanently using Edge Function
 * This permanently deletes the account, all associated data, and storage objects
 * @throws Error if deletion fails or user is not authenticated
 */
export async function deleteAccountPermanently(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  
  if (!token) {
    throw new Error('not_authenticated');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not configured');
  }

  if (!anonKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured');
  }

  const url = `${supabaseUrl}/functions/v1/delete-account`;
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': anonKey,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    let errorText: string;
    try {
      const errorJson = await resp.json();
      errorText = JSON.stringify(errorJson);
    } catch {
      errorText = await resp.text();
    }
    
    console.error('[settingsService] Failed to delete account permanently:', {
      status: resp.status,
      statusText: resp.statusText,
      error: errorText,
      url,
    });
    
    // Handle specific error cases
    if (resp.status === 404) {
      throw new Error('Edge Function not found. Please ensure the delete-account function is deployed.');
    }
    
    throw new Error(errorText || `Failed to delete account (${resp.status})`);
  }

  // Parse response to ensure it's successful
  try {
    const result = await resp.json();
    if (!result.ok) {
      throw new Error(result.error || 'delete_failed');
    }
  } catch (parseError) {
    // If response is not JSON, check status code
    if (!resp.ok) {
      throw new Error(`Failed to delete account (${resp.status})`);
    }
    // If status is ok but response isn't valid JSON, that's okay - assume success
  }
}
