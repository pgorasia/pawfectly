import { Session, User, AuthError } from '@supabase/supabase-js';

/**
 * Result type for auth operations that may succeed or fail.
 */
export type AuthResult<T> = {
  data: T | null;
  error: AuthError | null;
};

/**
 * Auth state change event types.
 */
export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'PASSWORD_RECOVERY';

/**
 * Callback function for auth state changes.
 */
export type AuthStateChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null
) => void;

/**
 * User session information.
 */
export type UserSession = {
  user: User;
  session: Session;
};

