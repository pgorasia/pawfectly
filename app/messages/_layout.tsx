import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

export default function MessagesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        ...DEFAULT_HEADER_OPTIONS,
        // Prevent screen from unmounting when keyboard opens/closes
        animation: 'none', // Disable animations that can trigger remounts
        presentation: 'card', // Use card presentation mode
        // React Navigation options for Android
        ...(Platform.OS === 'android' && {
          statusBarAnimation: 'none',
        }),
      }}
    >
      <Stack.Screen
        name="[conversationId]"
        options={{
          // Additional options to prevent remount
          gestureEnabled: true,
          animationTypeForReplace: 'pop',
        }}
      />
      <Stack.Screen
        name="request/[conversationId]"
        options={{
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="cross-lane/[otherUserId]"
        options={{
          gestureEnabled: true,
        }}
      />
      <Stack.Screen
        name="new/[otherUserId]"
        options={{
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
