/**
 * Auth Screen
 * Supports email/password signup and signin, plus Google OAuth
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/services/supabase/supabaseClient';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { loadMe } from '@/services/profile/statusRepository';

// Complete OAuth session in browser
WebBrowser.maybeCompleteAuthSession();

type AuthMode = 'signup' | 'signin';

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>((params.mode as AuthMode) || 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update mode if query param changes
  useEffect(() => {
    if (params.mode === 'signin' || params.mode === 'signup') {
      setMode(params.mode as AuthMode);
    }
  }, [params.mode]);

  const handleEmailAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { error: signUpError } = await signUp(email.trim(), password);
        if (signUpError) {
          // Check if account already exists
          if (signUpError.message.includes('already registered') || signUpError.message.includes('already exists')) {
            setError('Account already exists. Please sign in.');
            setMode('signin');
            // Keep email prefilled, focus will be on password
            return;
          }
          setError(signUpError.message || 'Sign up failed');
          return;
        }
      } else {
        const { error: signInError } = await signIn(email.trim(), password);
        if (signInError) {
          setError(signInError.message || 'Sign in failed');
          return;
        }
      }

      // Success - load user data and check onboarding state, then route accordingly
      // Small delay to ensure auth state is updated
      setTimeout(async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            // Load minimal "me" data for routing (optimized single RPC call)
            const me = await loadMe();

            // Check if profile validation failed (needs corrective action)
            // If so, route to the page indicated by last_step (usually 'photos')
            
            const validationStatus = me.profile?.validation_status;

            // 1) Resume onboarding if not completed
            if (me.onboarding.last_step && me.onboarding.last_step !== 'done') {
              switch (me.onboarding.last_step) {
                case 'pack':
                  router.replace('/(profile)/dogs');
                  break;
                case 'human':
                  router.replace('/(profile)/human');
                  break;
                case 'photos':
                  router.replace('/(profile)/photos');
                  break;
                case 'preferences':
                  router.replace('/(profile)/connection-style');
                  break;
                default:
                  router.replace('/(profile)/dogs');
              }
              return;
            }

            // 2) Onboarding complete: corrective photos only when truly failed
            if (validationStatus === 'failed_photos' || validationStatus === 'failed_requirements') {
              router.replace('/(profile)/photos');
              return;
            }

            // 3) in_progress / passed / not_started => allow app access
            router.replace('/(tabs)');
          } else {
            router.replace('/(profile)/dogs');
          }
        } catch (error) {
          console.error('[AuthScreen] Error checking onboarding state:', error);
          // Default to pack page on error
          router.replace('/(profile)/dogs');
        }
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);

    try {
      // Google OAuth with PKCE flow for Expo
      const redirectTo = Platform.select({
        web: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined,
        default: `${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/callback`,
      });

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo,
          skipBrowserRedirect: false,
        },
      });

      if (oauthError) {
        setError(oauthError.message || 'Google sign in failed');
        setLoading(false);
        return;
      }

      // For Expo, open the OAuth URL in browser
      if (data.url && Platform.OS !== 'web') {
        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo!
        );

        if (result.type === 'success') {
          // Extract the URL from the result
          const url = new URL(result.url);
          const accessToken = url.searchParams.get('access_token');
          const refreshToken = url.searchParams.get('refresh_token');

          if (accessToken && refreshToken) {
            // Set the session
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            // Navigation will happen via AuthContext onAuthStateChange
          }
        } else if (result.type === 'cancel') {
          // User cancelled - no error needed
          setLoading(false);
          return;
        }
      }

      // On web, the redirect will happen automatically
      // AuthContext will handle the session update
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.container}>
        <View style={styles.header}>
          <AppText variant="heading" style={styles.title}>
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            {mode === 'signup'
              ? 'Join Pawfectly to connect with other dog lovers'
              : 'Welcome back! Sign in to continue'}
          </AppText>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <AppText variant="body" style={styles.label}>
              Email
            </AppText>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor={Colors.text + '80'}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <AppText variant="body" style={styles.label}>
              Password
            </AppText>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor={Colors.text + '80'}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'signup' ? 'password-new' : 'password'}
              editable={!loading}
            />
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <AppText variant="caption" color={Colors.accent} style={styles.errorText}>
                {error}
              </AppText>
            </View>
          )}

          <AppButton
            variant="primary"
            onPress={handleEmailAuth}
            disabled={loading}
            loading={loading}
            style={styles.button}
          >
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </AppButton>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <AppText variant="caption" style={styles.dividerText}>
              OR
            </AppText>
            <View style={styles.dividerLine} />
          </View>

          <AppButton
            variant="ghost"
            onPress={handleGoogleAuth}
            disabled={loading}
            style={styles.button}
          >
            Continue with Google
          </AppButton>

          <View style={styles.switchContainer}>
            <AppText variant="body" style={styles.switchText}>
              {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            </AppText>
            <TouchableOpacity
              onPress={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError(null);
              }}
              disabled={loading}
            >
              <AppText variant="body" color={Colors.primary} style={styles.switchLink}>
                {mode === 'signup' ? 'Sign In' : 'Sign Up'}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  label: {
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.text,
    borderRadius: 8,
    padding: Spacing.md,
    fontSize: 16,
    minHeight: 44,
    color: Colors.text,
  },
  errorContainer: {
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.accent + '20',
    borderRadius: 4,
  },
  errorText: {
    textAlign: 'center',
  },
  button: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.text + '30',
  },
  dividerText: {
    marginHorizontal: Spacing.md,
    opacity: 0.5,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.lg,
  },
  switchText: {
    opacity: 0.7,
  },
  switchLink: {
    fontWeight: '600',
  },
});

