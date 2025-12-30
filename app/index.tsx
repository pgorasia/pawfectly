import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { loadBootstrap, getOrCreateOnboarding } from '@/services/profile/statusRepository';
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

export default function Index() {
  const router = useRouter();
  const { user, initializing } = useAuth();
  const { loadFromDatabase } = useProfileDraft();

  useEffect(() => {
    if (initializing) return;

    const checkOnboardingAndRoute = async () => {
      if (!user) {
        // Not authenticated - go to welcome
        router.replace('/(onboarding)/welcome');
        return;
      }

      try {
        // Load bootstrap data (profile, onboarding, draft)
        const bootstrap = await loadBootstrap(user.id);
        
        // Ensure onboarding_status row exists
        await getOrCreateOnboarding(user.id);
        
        // Load data into draft context
        if (bootstrap.draft.profile || bootstrap.draft.dogs.length > 0 || bootstrap.draft.preferences) {
          loadFromDatabase({
            profile: bootstrap.draft.profile,
            dogs: bootstrap.draft.dogs,
            preferences: bootstrap.draft.preferences,
          });
        }

        const profile = bootstrap.profile;
        const onboarding = bootstrap.onboarding;

        // Routing logic:
        // 1. If profile.lifecycle_status is 'active' => route to feed
        if (profile?.lifecycle_status === 'active') {
          router.replace('/(tabs)');
          return;
        }

        // 2. Else (onboarding, pending_review, or limited):
        //    - If last_step is 'done' => route to Photos (corrective action)
        //    - Else => route to onboarding_status.last_step
        if (!onboarding) {
          // New user - go to pack page
          router.replace('/(profile)/dogs');
          return;
        }

        if (onboarding.last_step === 'done') {
          // Route to Photos (only corrective action users can take)
          router.replace('/(profile)/photos');
          return;
        }

        // Route to onboarding.last_step
        switch (onboarding.last_step) {
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
  }, [user, initializing, router, loadFromDatabase]);

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

