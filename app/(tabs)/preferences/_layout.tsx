import { Stack } from 'expo-router';
import { PreferencesHeaderLeft } from '@/components/navigation/PreferencesHeaderLeft';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

export default function PreferencesLayout() {
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
          title: 'Preferences',
          headerLeft: () => <PreferencesHeaderLeft />,
        }}
      />
    </Stack>
  );
}
