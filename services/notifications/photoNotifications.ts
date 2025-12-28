/**
 * Photo notification service
 * Handles local notifications for photo validation status changes
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[PhotoNotifications] Notification permissions not granted');
    return false;
  }

  // Configure Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('photo-validation', {
      name: 'Photo Validation',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return true;
}

/**
 * Send a notification when a photo is rejected
 */
export async function sendPhotoRejectedNotification(photoId: string, reason?: string | null): Promise<void> {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.warn('[PhotoNotifications] Cannot send notification - permissions not granted');
    return;
  }

  const rejectionMessage = getRejectionMessage(reason);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Photo Rejected',
      body: rejectionMessage,
      data: {
        type: 'photo_rejected',
        photoId,
        screen: '/(profile)/photos',
      },
      sound: true,
    },
    trigger: null, // Show immediately
  });
}

/**
 * Get user-friendly rejection message
 */
function getRejectionMessage(reason: string | null | undefined): string {
  if (!reason) return 'Your photo was rejected. Please upload a new one.';
  
  if (reason === 'nsfw_or_disallowed' || reason.includes('NSFW') || reason.includes('inappropriate')) {
    return 'Inappropriate photo detected. Please upload a different photo.';
  }
  if (reason === 'missing_dog' || reason.includes('no dog') || reason.includes('dog is missing')) {
    return 'No dog found in photo. Please upload a photo with your dog.';
  }
  if (reason === 'missing_human' || reason.includes('no human') || reason.includes('human is missing')) {
    return 'No person found in photo. Please upload a photo with yourself.';
  }
  if (reason === 'contains_contact_info' || reason.includes('contact') || reason.includes('phone') || reason.includes('email') || reason.includes('Instagram')) {
    return 'Contact information detected. Please upload a photo without contact info.';
  }
  if (reason === 'is_screenshot' || reason.includes('screenshot') || reason.includes('UI capture') || reason.includes('screen capture')) {
    return 'Screenshots are not allowed. Please upload an actual photo.';
  }
  
  return 'Your photo was rejected. Please upload a new one.';
}

/**
 * Get the notification response handler
 * This should be called when app receives a notification tap
 */
export function setupNotificationHandler(
  onNotificationTapped: (data: { type: string; photoId?: string; screen?: string }) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    onNotificationTapped(data as { type: string; photoId?: string; screen?: string });
  });
}

