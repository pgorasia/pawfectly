/**
 * LikeComposerModal Component
 * Modal for composing a like with optional compliment message
 */

import React, { useState } from 'react';
import { View, StyleSheet, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface LikeComposerModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (message: string | null) => void;
  sourceType?: 'photo' | 'prompt';
}

export const LikeComposerModal: React.FC<LikeComposerModalProps> = ({
  visible,
  onClose,
  onSubmit,
  sourceType,
}) => {
  const [message, setMessage] = useState('');

  const handleSubmit = () => {
    const trimmedMessage = message.trim() || null;
    onSubmit(trimmedMessage);
    setMessage('');
  };

  const handleClose = () => {
    setMessage('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContent}>
            <AppText variant="heading" style={styles.title}>
              Send a Like
            </AppText>
            {sourceType && (
              <AppText variant="caption" style={styles.subtitle}>
                {sourceType === 'photo' ? 'You liked a photo' : 'You liked a prompt'}
              </AppText>
            )}
            
            <AppText variant="body" style={styles.label}>
              Add a compliment (optional)
            </AppText>
            <TextInput
              style={styles.input}
              placeholder="Say something nice..."
              placeholderTextColor={Colors.text + '60'}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
              maxLength={200}
              textAlignVertical="top"
            />
            <AppText variant="caption" style={styles.charCount}>
              {message.length}/200
            </AppText>

            <View style={styles.buttonContainer}>
              <AppButton
                variant="ghost"
                style={styles.button}
                onPress={handleClose}
              >
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                style={styles.button}
                onPress={handleSubmit}
              >
                Send Like
              </AppButton>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl,
    maxHeight: '80%',
  },
  title: {
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
    opacity: 0.7,
  },
  label: {
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.text + '30',
    borderRadius: 8,
    padding: Spacing.md,
    minHeight: 100,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  charCount: {
    alignSelf: 'flex-end',
    opacity: 0.5,
    marginBottom: Spacing.lg,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
  },
});
