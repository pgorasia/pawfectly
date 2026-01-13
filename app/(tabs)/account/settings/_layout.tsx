import { Stack } from 'expo-router';
import { BackTo } from '@/components/navigation/BackTo';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
          headerLeft: () => <BackTo href="/(tabs)/account" />,
        }}
      />
      <Stack.Screen
        name="subscription"
        options={{
          title: 'Subscription',
          headerLeft: () => <BackTo href="/(tabs)/account/settings" />,
        }}
      />
      <Stack.Screen
        name="blocked-users"
        options={{
          title: 'Blocked Users',
          headerLeft: () => <BackTo href="/(tabs)/account/settings" />,
        }}
      />
    </Stack>
  );
}

