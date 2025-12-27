import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getOnboardingState, loadUserData } from '@/services/supabase/onboardingService';
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
        // Load user data from database
        const userData = await loadUserData(user.id);
        
        // Load data into draft context
        if (userData.profile || userData.dogs.length > 0 || userData.preferences) {
          loadFromDatabase({
            profile: userData.profile,
            dogs: userData.dogs,
            preferences: userData.preferences,
          });
        }

        // Check onboarding state
        const onboardingState = userData.onboardingState;

        if (!onboardingState) {
          // New user - go to pack page
          router.replace('/(profile)/dogs');
        } else if (onboardingState.last_step === 'done') {
          // Completed onboarding - go to feed
          router.replace('/(tabs)');
        } else {
          // Route to the page indicated by last_step (current page user is on)
          switch (onboardingState.last_step) {
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

