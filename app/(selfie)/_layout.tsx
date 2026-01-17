import { Stack } from 'expo-router';
import { BackTo } from '@/components/navigation/BackTo';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

export default function SelfieVerifyLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        ...DEFAULT_HEADER_OPTIONS,
      }}
    >
      <Stack.Screen
        name="intro"
        options={{
          title: 'Selfie verification',
          headerLeft: () => <BackTo href="/(tabs)/account?tab=trust_safety" />,
        }}
      />
      <Stack.Screen
        name="photo-selection"
        options={{
          title: 'Choose photo',
          headerLeft: () => <BackTo href="/(selfie)/intro" />,
        }}
      />
      <Stack.Screen
        name="camera"
        options={{
          title: 'Take selfie',
          headerLeft: () => <BackTo href="/(selfie)/photo-selection" />,
        }}
      />
      <Stack.Screen
        name="result"
        options={{
          title: 'Result',
          headerLeft: () => <BackTo href="/(tabs)/account?tab=trust_safety" />,
        }}
      />
    </Stack>
  );
}
