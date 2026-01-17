import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthSessionStoreProvider } from "@/contexts/AuthSessionStore";
import { MeProvider } from "@/contexts/MeContext";
import { ProfileDraftProvider } from "@/hooks/useProfileDraft";
import { MeBootstrapper } from "@/components/common/MeBootstrapper";
import { DraftBootstrapper } from "@/components/common/DraftBootstrapper";
import { AuthSessionSync } from "@/components/common/AuthSessionSync";
import { setupNotificationHandler } from "@/services/notifications/photoNotifications";
import * as Notifications from "expo-notifications";
import { DEFAULT_HEADER_OPTIONS } from "@/constants/navigation";

function NotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    const subscription = setupNotificationHandler((data) => {
      if (data.type === "photo_rejected" && data.screen) {
        router.push(data.screen as any);
      }
    });

    const foregroundSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log("[RootLayout] Notification received:", notification);
      }
    );

    return () => {
      subscription.remove();
      foregroundSubscription.remove();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    // Android navigation bar: render as an overlay so we can control the in-app "letterbox"
    // spacing using Safe Area insets. This is the most consistent way to ensure action bars
    // (chat input, accept/reject, bottom tabs) never collide with system navigation.
    if (Platform.OS === "android") {
      NavigationBar.setPositionAsync("absolute").catch(() => undefined);
      NavigationBar.setBackgroundColorAsync("#000000").catch(() => undefined);
      NavigationBar.setBorderColorAsync("#000000").catch(() => undefined);
      NavigationBar.setButtonStyleAsync("light").catch(() => undefined);
    }
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthSessionStoreProvider>
          <AuthProvider>
            <AuthSessionSync />
            <MeProvider>
              <ProfileDraftProvider>
                <MeBootstrapper />
                <DraftBootstrapper />
                <NotificationHandler />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    ...DEFAULT_HEADER_OPTIONS,
                  }}
                />
              </ProfileDraftProvider>
            </MeProvider>
          </AuthProvider>
        </AuthSessionStoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
