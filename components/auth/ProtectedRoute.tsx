/**
 * Protected Route Component
 * Guards routes that require authentication
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, initializing } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (initializing) return;

    // Check if we're in a protected route
    // Profile routes require auth, onboarding welcome doesn't
    const isProtectedRoute = segments[0] === 'profile';
    const isOnboardingProtected = segments[0] === 'onboarding' && segments[1] !== 'welcome';

    if ((isProtectedRoute || isOnboardingProtected) && !user) {
      // Redirect to auth if not authenticated
      router.replace('/(auth)');
    }
  }, [user, initializing, segments, router]);

  if (initializing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <AppText variant="body" style={styles.loadingText}>
          Loading...
        </AppText>
      </View>
    );
  }

  if (!user) {
    // Will redirect via useEffect, but show loading in meantime
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: Spacing.md,
    opacity: 0.7,
  },
});

