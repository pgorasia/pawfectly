import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        presentation: 'card',
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
