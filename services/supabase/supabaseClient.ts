import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Determines the current environment.
 * - Uses EXPO_PUBLIC_ENV if explicitly set to 'production'
 * - Otherwise defaults to 'development' (especially in local dev with __DEV__)
 */
function getEnvironment(): 'development' | 'production' {
  const envVar = process.env.EXPO_PUBLIC_ENV;
  
  // If explicitly set to production, use production
  if (envVar === 'production') {
    return 'production';
  }
  
  // Default to development (for local dev, __DEV__ is typically true)
  return 'development';
}

/**
 * Gets the Supabase URL for the current environment.
 * Throws if the required env var is missing.
 */
function getSupabaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  
  if (!url) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_URL environment variable. ' +
      'Please ensure it is set in your .env file.'
    );
  }
  
  return url;
}

/**
 * Gets the Supabase anon key for the current environment.
 * Throws if the required env var is missing.
 */
function getSupabaseAnonKey(): string {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!key) {
    throw new Error(
      'Missing EXPO_PUBLIC_SUPABASE_ANON_KEY environment variable. ' +
      'Please ensure it is set in your .env file.'
    );
  }
  
  return key;
}

/**
 * Creates and returns a singleton Supabase client instance.
 * The client is configured based on EXPO_PUBLIC_ENV:
 * - 'production' -> uses production env vars
 * - 'development' (default) -> uses development env vars
 * 
 * In local development, defaults to development unless EXPO_PUBLIC_ENV=production.
 */
let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const env = getEnvironment();
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  // Temporary logger: print environment and URL host
  try {
    const urlObj = new URL(url);
    console.log(`[Supabase] Environment: ${env}, URL Host: ${urlObj.host}`);
  } catch (e) {
    console.log(`[Supabase] Environment: ${env}, URL: ${url.substring(0, 50)}...`);
  }

  // Log environment for debugging (only in dev)
  if (__DEV__) {
    console.log(`[Supabase] Initializing client for environment: ${env}`);
  }

  supabaseInstance = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseInstance;
}

/**
 * Singleton Supabase client instance.
 * Use this throughout the app to access Supabase.
 */
export const supabase = getSupabaseClient();

