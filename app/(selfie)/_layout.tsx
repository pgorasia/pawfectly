import { Stack } from 'expo-router';
import { BackTo } from '@/components/navigation/BackTo';

export default function SelfieVerifyLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen
        name="intro"
        options={{
          title: 'Selfie verification',
          headerLeft: () => <BackTo href="/(tabs)/account?tab=badges" />,
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
          headerLeft: () => <BackTo href="/(tabs)/account?tab=badges" />,
        }}
      />
    </Stack>
  );
}
