/**
 * Reset Dislikes Modal Component
 * Modal for resetting dislikes with lane selection (like Dil Mil)
 */

import React, { useState, useEffect } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface ResetDislikesModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (lanes: Array<'pals' | 'match'>) => Promise<void>;
  loading?: boolean;
  palsEnabled: boolean;
  matchEnabled: boolean;
}

export const ResetDislikesModal: React.FC<ResetDislikesModalProps> = ({
  visible,
  onClose,
  onSubmit,
  loading = false,
  palsEnabled,
  matchEnabled,
}) => {
  const [resetPals, setResetPals] = useState(palsEnabled);
  const [resetMatch, setResetMatch] = useState(matchEnabled);

  // Reset to default (enabled state) when modal opens
  useEffect(() => {
    if (visible) {
      setResetPals(palsEnabled);
      setResetMatch(matchEnabled);
    }
  }, [visible, palsEnabled, matchEnabled]);

  const handleSubmit = async () => {
    const lanes: Array<'pals' | 'match'> = [];
    if (resetPals) lanes.push('pals');
    if (resetMatch) lanes.push('match');

    if (lanes.length === 0) {
      return; // At least one must be selected
    }

    await onSubmit(lanes);
    // Reset checkboxes to enabled state after successful submit
    setResetPals(palsEnabled);
    setResetMatch(matchEnabled);
  };

  const handleClose = () => {
    // Reset to enabled state
    setResetPals(palsEnabled);
    setResetMatch(matchEnabled);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <AppText variant="heading" style={styles.title}>
            Reset Dislikes
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            Select which lanes you want to reset dislikes for:
          </AppText>

          <View style={styles.checkboxContainer}>
            {palsEnabled && (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setResetPals(!resetPals)}
                disabled={loading}
              >
                <View style={[styles.checkbox, resetPals && styles.checkboxChecked]}>
                  {resetPals && (
                    <AppText variant="body" style={styles.checkmark}>
                      ✓
                    </AppText>
                  )}
                </View>
                <View style={styles.checkboxLabel}>
                  <AppText variant="body" style={styles.checkboxTitle}>
                    Pawsome Pals
                  </AppText>
                  <AppText variant="caption" style={styles.checkboxSubtitle}>
                    Reset dislikes for the pals lane
                  </AppText>
                </View>
              </TouchableOpacity>
            )}

            {matchEnabled && (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setResetMatch(!resetMatch)}
                disabled={loading}
              >
                <View style={[styles.checkbox, resetMatch && styles.checkboxChecked]}>
                  {resetMatch && (
                    <AppText variant="body" style={styles.checkmark}>
                      ✓
                    </AppText>
                  )}
                </View>
                <View style={styles.checkboxLabel}>
                  <AppText variant="body" style={styles.checkboxTitle}>
                    Pawfect Match
                  </AppText>
                  <AppText variant="caption" style={styles.checkboxSubtitle}>
                    Reset dislikes for the match lane
                  </AppText>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.buttonContainer}>
            <AppButton
              variant="ghost"
              style={styles.button}
              onPress={handleClose}
              disabled={loading}
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              style={styles.button}
              onPress={handleSubmit}
              loading={loading}
              disabled={loading || (!resetPals && !resetMatch)}
            >
              Reset
            </AppButton>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
  },
  title: {
    marginBottom: Spacing.sm,
  },
  subtitle: {
    marginBottom: Spacing.lg,
    opacity: 0.7,
  },
  checkboxContainer: {
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.text + '40',
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: {
    color: Colors.background,
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
  },
  checkboxTitle: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  checkboxSubtitle: {
    opacity: 0.7,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  button: {
    flex: 1,
  },
});
