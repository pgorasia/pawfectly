import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { publicPhotoUrl } from '@/utils/photoUrls';
import { getOrCreateConversation, sendMessage } from '@/services/messages/messagesService';
import { chatEvents, CHAT_EVENTS } from '@/utils/chatEvents';

function generateClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function NewChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { otherUserId, peerName, peerPhotoPath, lane } = useLocalSearchParams<{
    otherUserId: string;
    peerName?: string;
    peerPhotoPath?: string;
    lane?: 'pals' | 'match';
  }>();

  const otherId = otherUserId || '';
  const displayName = peerName || 'User';
  const peerPhotoUrl = useMemo(() => publicPhotoUrl(peerPhotoPath || ''), [peerPhotoPath]);
  const targetLane: 'pals' | 'match' = lane === 'pals' ? 'pals' : 'match';

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const canSend = text.trim().length > 0 && !sending;

  const handleSend = useCallback(async () => {
    if (!otherId) return;
    const messageText = text.trim();
    if (!messageText) return;

    setSending(true);
    try {
      // IMPORTANT: Do not create a conversation until the user actually sends.
      const convo = await getOrCreateConversation(otherId, targetLane);

      const clientMessageId = generateClientMessageId();
      const { data, error } = await sendMessage(convo.conversation_id, messageText, 'text', {}, clientMessageId);
      if (error || !data?.message_id) {
        throw error || new Error('send_failed');
      }

      // Let Messages screen move match -> thread without full refetch.
      chatEvents.emit(CHAT_EVENTS.FIRST_MESSAGE_SENT, {
        conversationId: convo.conversation_id,
        peerUserId: otherId,
        messageText,
        messageId: data.message_id,
        sentAt: new Date().toISOString(),
      });

      Keyboard.dismiss();
      router.replace({
        pathname: '/messages/[conversationId]',
        params: {
          conversationId: convo.conversation_id,
          peerName: displayName,
          peerPhotoPath: peerPhotoPath || '',
          peerUserId: otherId,
        },
      });
    } catch (e: any) {
      console.error('[NewChatScreen] Failed to send first message:', e);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }, [otherId, text, router, displayName, peerPhotoPath, targetLane]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <AppText variant="body" style={styles.headerTitle} numberOfLines={1}>
            {displayName}
          </AppText>
          <AppText variant="caption" style={styles.headerSubtitle} numberOfLines={1}>
            Say hi
          </AppText>
        </View>

        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <View style={styles.heroRow}>
          {peerPhotoUrl ? (
            <Image source={{ uri: peerPhotoUrl }} style={styles.heroPhoto} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.heroPhoto, styles.heroFallback]}>
              <AppText variant="heading" style={styles.heroFallbackText}>
                {displayName?.[0] || '?'}
              </AppText>
            </View>
          )}
          <View style={styles.heroText}>
            <AppText variant="heading" style={styles.heroTitle}>
              Send a message
            </AppText>
            <AppText variant="body" style={styles.heroSubtitle}>
              This will start your chat.
            </AppText>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <View style={styles.composer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Send message"
            placeholderTextColor="rgba(31, 41, 55, 0.45)"
            multiline
            autoFocus
            editable={!sending}
          />
          <AppButton
            variant="primary"
            onPress={handleSend}
            disabled={!canSend}
            style={styles.sendButton}
          >
            {sending ? (
              <View style={styles.sendingRow}>
                <ActivityIndicator size="small" color={Colors.background} />
                <AppText variant="caption" style={styles.sendingText}>
                  Sending
                </AppText>
              </View>
            ) : (
              'Send'
            )}
          </AppButton>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    opacity: 0.65,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  heroRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  heroPhoto: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Colors.cardBackground,
  },
  heroFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  heroFallbackText: {
    color: Colors.background,
    fontWeight: '900',
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontWeight: '900',
  },
  heroSubtitle: {
    marginTop: 4,
    opacity: 0.7,
  },
  composer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 41, 55, 0.1)',
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  input: {
    minHeight: 46,
    maxHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.15)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: 'rgba(31, 41, 55, 0.03)',
  },
  sendButton: {
    width: '100%',
  },
  sendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendingText: {
    color: Colors.background,
    fontWeight: '700',
  },
});

