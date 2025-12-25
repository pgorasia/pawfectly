import { supabase } from './supabaseClient';
import type {
  AuthResult,
  AuthStateChangeCallback,
  AuthChangeEvent,
  UserSession,
} from '../../types/auth';
import type { Session, User } from '@supabase/supabase-js';

/**
 * Signs up a new user with email and password.
 * 
 * @param email - User's email address
 * @param password - User's password
 * @returns Promise with user data or error
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<AuthResult<{ user: User; session: Session | null }>> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  return {
    data: data ? { user: data.user!, session: data.session } : null,
    error,
  };
}

/**
 * Signs in an existing user with email and password.
 * 
 * @param email - User's email address
 * @param password - User's password
 * @returns Promise with session data or error
 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<AuthResult<UserSession>> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return {
    data: data?.session && data.user
      ? { user: data.user, session: data.session }
      : null,
    error,
  };
}

/**
 * Signs out the current user.
 * 
 * @returns Promise with error if sign out fails
 */
export async function signOut(): Promise<AuthResult<void>> {
  const { error } = await supabase.auth.signOut();

  return {
    data: error ? null : undefined,
    error,
  };
}

/**
 * Gets the current session if one exists.
 * 
 * @returns Promise with current session or null
 */
export async function getSession(): Promise<AuthResult<Session>> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  return {
    data: session,
    error,
  };
}

/**
 * Gets the current user if one is authenticated.
 * 
 * @returns Promise with current user or null
 */
export async function getCurrentUser(): Promise<AuthResult<User>> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return {
    data: user,
    error,
  };
}

/**
 * Sets up a listener for auth state changes.
 * 
 * @param callback - Function to call when auth state changes
 * @returns Subscription object with unsubscribe method
 */
export function onAuthStateChange(
  callback: AuthStateChangeCallback
): { unsubscribe: () => void } {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event as AuthChangeEvent, session);
  });

  return {
    unsubscribe: () => {
      subscription?.unsubscribe();
    },
  };
}

