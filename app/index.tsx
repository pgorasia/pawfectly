import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { loadMe } from '@/services/profile/statusRepository';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

export default function Index() {
  const router = useRouter();
  const { user, initializing, signOut } = useAuth();

  useEffect(() => {
    if (initializing) return;

    const checkOnboardingAndRoute = async () => {
      if (!user) {
        // Not authenticated - go to welcome
        router.replace('/(onboarding)/welcome');
        return;
      }

      try {
        // Load minimal "me" data for routing (optimized single RPC call)
        const me = await loadMe();

        // Safety check: If profile is deleted, sign out immediately
        if (me.profile?.deleted_at) {
          console.log('[Index] Profile is deleted (deleted_at:', me.profile.deleted_at, '), signing out...');
          await signOut();
          router.replace('/(onboarding)/welcome');
          return;
        }

        // Routing logic:
        // 1. If profile.lifecycle_status is 'active' => route to feed
        if (me.profile?.lifecycle_status === 'active') {
          router.replace('/(tabs)');
          return;
        }

        // 2. Else (onboarding, pending_review, or limited):
        //    - If last_step is 'done' => route to Photos (corrective action)
        //    - Else => route to onboarding_status.last_step
        
if (me.onboarding.last_step === 'done') {
  // Onboarding complete. Route based on server-authoritative validation state.
  const validationStatus = me.profile?.validation_status;
  if (validationStatus === 'failed_photos' || validationStatus === 'failed_requirements') {
    // Action needed (corrective photo requirements)
    router.replace('/(profile)/photos');
  } else {
    // in_progress / passed / not_started => allow app access (show banner if desired)
    router.replace('/(tabs)');
  }
  return;
}

        // Route to onboarding.last_step
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
            // Fallback to dogs page
            router.replace('/(profile)/dogs');
        }
      } catch (error) {
        console.error('[Index] Error checking onboarding state:', error);
        // Default to pack page on error
        router.replace('/(profile)/dogs');
      }
    };

    checkOnboardingAndRoute();
  }, [user, initializing, router]);

  // Show loading while checking auth state
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

  // Show loading while routing
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

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

