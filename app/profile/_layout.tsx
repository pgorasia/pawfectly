import { Stack } from 'expo-router';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        presentation: 'card',
        ...DEFAULT_HEADER_OPTIONS,
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          headerTitle: 'Profile',
        }}
      />
    </Stack>
  );
}
