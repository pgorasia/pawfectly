import { Stack } from 'expo-router';
import { BackTo } from '@/components/navigation/BackTo';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

export default function AccountLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        ...DEFAULT_HEADER_OPTIONS,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="edit-pack" />
      <Stack.Screen
        name="plus"
        options={{
          headerShown: true,
          title: 'Upgrade to Plus',
          headerLeft: () => <BackTo href="/(tabs)/account" />,
        }}
      />
      <Stack.Screen
        name="consumables/[type]"
        options={{
          headerShown: true,
          title: 'Consumable',
          headerLeft: () => <BackTo href="/(tabs)/account" />,
        }}
      />
      <Stack.Screen
        name="profile"
        options={{
          headerShown: true,
          title: 'Profile',
          headerLeft: () => <BackTo href="/(tabs)/account" />,
        }}
      />
      <Stack.Screen
        name="profile-trust"
        options={{
          headerShown: true,
          title: 'Profile',
          headerLeft: () => <BackTo href="/(tabs)/account?tab=trust_safety" />,
        }}
      />
      <Stack.Screen
        name="blocked-users"
        options={{
          headerShown: true,
          title: 'Blocked Users',
          headerLeft: () => <BackTo href="/(tabs)/account?tab=trust_safety" />,
        }}
      />
    </Stack>
  );
}

