/**
 * Authentication Context
 * Manages Supabase auth state, session persistence, and auth operations
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getSession, getCurrentUser, signInWithEmail, signUpWithEmail, signOut, onAuthStateChange } from '@/services/supabase/authService';
import type { User, Session } from '@supabase/supabase-js';
import { initializeOnboardingState } from '@/services/supabase/onboardingService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;

    // Load initial session
    const initializeAuth = async () => {
      try {
        const { data: sessionData } = await getSession();
        if (mounted) {
          setSession(sessionData);
          setUser(sessionData?.user ?? null);
        }
      } catch (error) {
        console.error('[AuthContext] Failed to load session:', error);
      } finally {
        if (mounted) {
          setInitializing(false);
        }
      }
    };

    initializeAuth();

    // Subscribe to auth state changes
    const { unsubscribe } = onAuthStateChange((event, session) => {
      console.log('[AuthContext] Auth state changed:', event, session?.user?.id);
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        setInitializing(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleSignIn = async (email: string, password: string) => {
    try {
      const { data, error } = await signInWithEmail(email, password);
      if (error) {
        return { error };
      }
      // Session is updated via onAuthStateChange
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Sign in failed') };
    }
  };

  const handleSignUp = async (email: string, password: string) => {
    try {
      const { data, error } = await signUpWithEmail(email, password);
      if (error) {
        return { error };
      }
      // Initialize onboarding state for new user
      if (data?.user?.id) {
        try {
          await initializeOnboardingState(data.user.id);
        } catch (initError) {
          console.error('[AuthContext] Failed to initialize onboarding state:', initError);
          // Don't fail sign-up if onboarding init fails
        }
      }
      // Session is updated via onAuthStateChange
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Sign up failed') };
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('[AuthContext] Sign out failed:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        initializing,
        signIn: handleSignIn,
        signUp: handleSignUp,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

