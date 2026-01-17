import { Stack } from 'expo-router';
import { BackTo } from '@/components/navigation/BackTo';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        ...DEFAULT_HEADER_OPTIONS,
      }}
    >
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

