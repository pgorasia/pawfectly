import { Stack } from 'expo-router';
import { PreferencesHeaderLeft } from '@/components/navigation/PreferencesHeaderLeft';

export default function PreferencesLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Preferences',
          headerLeft: () => <PreferencesHeaderLeft />,
        }}
      />
    </Stack>
  );
}
