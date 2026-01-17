import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { DEFAULT_HEADER_OPTIONS } from '@/constants/navigation';

interface Request {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  message: string;
  requestTime: Date;
}

// Mock data - in production, this would come from Supabase
const MOCK_REQUESTS: Record<string, Request> = {
  '1': {
    id: '1',
    userId: '201',
    userName: 'Alex',
    userAvatar: null,
    message: "Hey! I'd love to connect with you and our pups!",
    requestTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  '2': {
    id: '2',
    userId: '202',
    userName: 'Jordan',
    userAvatar: null,
    message: 'Your dog looks adorable! Want to set up a playdate?',
    requestTime: new Date(Date.now() - 12 * 60 * 60 * 1000),
  },
};

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function RequestDetailScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const request = MOCK_REQUESTS[conversationId || ''];

  if (!request) {
    return (
      <>
        <Stack.Screen 
          options={{ 
            ...DEFAULT_HEADER_OPTIONS,
            title: 'Request',
            headerShown: true,
            headerBackTitle: 'Back',
          }} 
        />
        <View style={styles.container}>
          <View style={styles.emptyState}>
            <AppText variant="body" style={styles.emptyStateText}>
              Request not found
            </AppText>
          </View>
        </View>
      </>
    );
  }

  const handleAccept = async () => {
    setIsProcessing(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsProcessing(false);
      Alert.alert(
        'Request Accepted',
        `You're now connected with ${request.userName}! You can start chatting.`,
        [
          {
            text: 'Start Chat',
            onPress: () => {
              // Navigate to the chat thread with the new conversation
              router.replace(`/messages/${conversationId}`);
            },
          },
          {
            text: 'OK',
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    }, 1000);
  };

  const handleDecline = () => {
    Alert.alert(
      'Decline Request',
      `Are you sure you want to decline ${request.userName}'s request?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            
            // Simulate API call
            setTimeout(() => {
              setIsProcessing(false);
              router.back();
            }, 1000);
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen 
        options={{ 
          ...DEFAULT_HEADER_OPTIONS,
          title: 'Connection Request',
          headerShown: true,
          headerBackTitle: 'Back',
        }} 
      />
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* User Profile Section */}
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <AppText variant="heading" style={styles.avatarText}>
                {request.userName[0]}
              </AppText>
            </View>
            <AppText variant="heading" style={styles.userName}>
              {request.userName}
            </AppText>
            <AppText variant="caption" style={styles.timeAgo}>
              {formatTimeAgo(request.requestTime)}
            </AppText>
          </View>

          {/* Message Section */}
          <View style={styles.messageSection}>
            <AppText variant="body" style={styles.sectionTitle}>
              Message
            </AppText>
            <View style={styles.messageBox}>
              <AppText variant="body" style={styles.messageText}>
                {request.message}
              </AppText>
            </View>
          </View>

          {/* Profile Preview Section (placeholder for future implementation) */}
          <View style={styles.profilePreviewSection}>
            <AppText variant="body" style={styles.sectionTitle}>
              Profile Preview
            </AppText>
            <TouchableOpacity 
              style={styles.viewProfileButton}
              onPress={() => router.push(`/profile/${request.userId}`)}
            >
              <AppText variant="body" style={styles.viewProfileButtonText}>
                View Full Profile
              </AppText>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.declineButton]}
            onPress={handleDecline}
            disabled={isProcessing}
          >
            <AppText variant="body" style={styles.declineButtonText}>
              Decline
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.button, styles.acceptButton, isProcessing && styles.buttonDisabled]}
            onPress={handleAccept}
            disabled={isProcessing}
          >
            <AppText variant="body" style={styles.acceptButtonText}>
              {isProcessing ? 'Processing...' : 'Accept'}
            </AppText>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    color: Colors.background,
    fontSize: 32,
  },
  userName: {
    fontSize: 24,
    marginBottom: Spacing.xs,
  },
  timeAgo: {
    opacity: 0.6,
  },
  messageSection: {
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: Spacing.md,
    fontSize: 16,
  },
  messageBox: {
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 12,
    padding: Spacing.md,
  },
  messageText: {
    lineHeight: 22,
  },
  profilePreviewSection: {
    marginTop: Spacing.lg,
  },
  viewProfileButton: {
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
  },
  viewProfileButtonText: {
    color: Colors.primary,
    fontWeight: '600',
  },
  actionContainer: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.1)',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  declineButtonText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  acceptButton: {
    backgroundColor: Colors.primary,
  },
  acceptButtonText: {
    color: Colors.background,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyStateText: {
    opacity: 0.5,
  },
});
