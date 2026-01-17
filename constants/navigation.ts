import { Colors } from './colors';

/**
 * Shared navigation/header defaults for all native-header screens.
 *
 * Why this exists:
 * Expo Router uses multiple nested navigators (each `_layout.tsx` creates a Stack/Tabs),
 * so there isn't one single "global" header safe-area toggle.
 *
 * Reuse this in:
 * - Stack `screenOptions`
 * - Individual `<Stack.Screen options={...}>` inside screens
 */
export const DEFAULT_HEADER_OPTIONS = {
  headerTopInsetEnabled: true,
  statusBarHidden: false,
  statusBarStyle: 'dark',
  statusBarColor: Colors.background,
  statusBarTranslucent: false,
} as const;

