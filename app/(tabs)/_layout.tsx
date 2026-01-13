import { Tabs, useFocusEffect } from 'expo-router';
import React, { useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/contexts/AuthContext';
import { getPromptQuestions } from '@/services/prompts/promptService';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const promptsPreloadedRef = useRef(false);

  // Pre-load prompt questions when entering tabs (once per session)
  // This eliminates lag when rendering DogPromptsDisplay
  // Contexts are already hydrated by canonical bootstrap in app/_layout.tsx
  useFocusEffect(
    React.useCallback(() => {
      if (!user?.id || promptsPreloadedRef.current) {
        return;
      }

      // Mark as preloaded immediately to prevent duplicate calls
      promptsPreloadedRef.current = true;

      // Pre-load prompt questions (static, cached) to avoid lag when rendering prompts
      getPromptQuestions().catch((error) => {
        console.error('[TabLayout] Failed to pre-load prompt questions:', error);
        // Reset flag on error so it can retry
        promptsPreloadedRef.current = false;
      });
    }, [user?.id])
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme ?? 'light'].background,
          borderTopColor: 'rgba(0,0,0,0.08)',
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 8),
          height: 56 + Math.max(insets.bottom, 8),
        },
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
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person" color={color} />,
        }}
      />
      <Tabs.Screen
        name="preferences"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}
