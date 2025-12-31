import { Tabs, useFocusEffect } from 'expo-router';
import React, { useEffect, useRef } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { useProfileDraft } from '@/hooks/useProfileDraft';
import { loadBootstrap } from '@/services/profile/statusRepository';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const { loadFromDatabase: loadMeFromDatabase } = useMe();
  const { loadFromDatabase: loadDraftFromDatabase } = useProfileDraft();
  const didHydrateRef = useRef(false);

  // Hydrate MeContext and DraftContext when entering tabs (once per session)
  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id || didHydrateRef.current) {
        return;
      }

      // Mark as hydrated immediately to prevent duplicate calls
      didHydrateRef.current = true;

      // Load full data and hydrate contexts
      loadBootstrap(user.id)
        .then((bootstrapData) => {
          // Update MeContext (server cache) with full data
          loadMeFromDatabase({
            profile: bootstrapData.draft.profile,
            dogs: bootstrapData.draft.dogs,
            preferences: bootstrapData.draft.preferences,
          });
          // Update DraftContext (for Account tabs that read from draft)
          loadDraftFromDatabase({
            profile: bootstrapData.draft.profile,
            dogs: bootstrapData.draft.dogs,
            preferences: bootstrapData.draft.preferences,
          });
        })
        .catch((error) => {
          console.error('[TabLayout] Failed to hydrate contexts:', error);
          // Reset flag on error so it can retry
          didHydrateRef.current = false;
        });
    }, [user?.id, loadMeFromDatabase, loadDraftFromDatabase])
  );

  // Reset hydration flag when user logs out
  useEffect(() => {
    if (!user) {
      didHydrateRef.current = false;
    }
  }, [user]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="message.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="liked-you"
        options={{
          title: 'Liked You',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="heart.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
