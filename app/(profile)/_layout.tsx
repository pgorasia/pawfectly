import React from 'react';
import { Stack } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useMe } from '@/contexts/MeContext';
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { BackTo } from '@/components/navigation/BackTo';
import { useLocalSearchParams } from 'expo-router';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

function ProfileDataGate({ children }: { children: React.ReactNode }) {
  const { meLoaded } = useMe();
  const { draftHydrated } = useProfileDraft();

  // Hold profile/onboarding screens until we have authoritative state from the server (Me)
  // and the local draft has been hydrated from it.
  if (!meLoaded || !draftHydrated) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <AppText variant="body" style={styles.loadingText}>
          Loading your profile...
        </AppText>
      </View>
    );
  }

  return <>{children}</>;
}

function PreferencesHeaderLeft() {
  const params = useLocalSearchParams<{ from?: string }>();
  
  const getBackHref = () => {
    if (params.from === 'feed') {
      return '/(tabs)';
    } else if (params.from === 'account') {
      return '/(tabs)/account';
    }
    return '/(tabs)/account'; // Default fallback
  };
  
  return <BackTo href={getBackHref()} />;
}

export default function ProfileLayout() {
  return (
    <ProtectedRoute>
      <ProfileDataGate>
        <Stack
          screenOptions={{
            headerShown: false,
            ...DEFAULT_HEADER_OPTIONS,
          }}
        >
          <Stack.Screen
            name="preferences"
            options={{
              headerShown: true,
              title: 'Preferences',
              headerLeft: () => <PreferencesHeaderLeft />,
            }}
          />
        </Stack>
      </ProfileDataGate>
    </ProtectedRoute>
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
