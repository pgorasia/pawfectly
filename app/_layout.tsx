import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProfileDraftProvider } from "@/hooks/useProfileDraft";
import { setupNotificationHandler } from "@/services/notifications/photoNotifications";
import * as Notifications from "expo-notifications";

function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    // Set up notification handler
    const subscription = setupNotificationHandler((data) => {
      if (data.type === 'photo_rejected' && data.screen) {
        // Navigate to photos page when notification is tapped
        router.push(data.screen as any);
      }
    });

    // Also handle notifications received while app is in foreground
    const foregroundSubscription = Notifications.addNotificationReceivedListener((notification) => {
      // Notification received while app is in foreground
      // The notification will still be shown, but we can handle it here if needed
      console.log('[RootLayout] Notification received:', notification);
    });

    return () => {
      subscription.remove();
      foregroundSubscription.remove();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <ProfileDraftProvider>
          <NotificationHandler />
          <Stack screenOptions={{ headerShown: false }} />
        </ProfileDraftProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
