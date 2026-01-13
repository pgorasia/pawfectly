import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthSessionStore } from '@/contexts/AuthSessionStore';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import { setProfileHidden } from '@/services/profile/statusRepository';
import { supabase } from '@/services/supabase/supabaseClient';
import { deleteAccountPermanently } from '@/services/account/settingsService';
import { useMe } from '@/contexts/MeContext';
import { resetDislikes, clearDislikeOutbox, markLanesForRefresh } from '@/services/feed/feedService';
import { ResetDislikesModal } from '@/components/account/ResetDislikesModal';

export default function SettingsScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { signOut, user } = useAuth();
  const { me, reset: resetMeCache } = useMe();
  const { setDeletingAccount } = useAuthSessionStore();
  const [hideProfile, setHideProfile] = useState(false);
  const [loadingHideProfile, setLoadingHideProfile] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  // Mock subscription status - in production, this would come from Supabase
  const [currentSubscription] = useState<string | null>('3 Months Premium');
  const [showPermanentDeleteModal, setShowPermanentDeleteModal] = useState(false);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState('');
  const [deletingPermanently, setDeletingPermanently] = useState(false);
  const [showResetDislikesModal, setShowResetDislikesModal] = useState(false);
  const [resettingDislikes, setResettingDislikes] = useState(false);

  // Load current is_hidden status
  useEffect(() => {
    const loadProfileHidden = async () => {
      if (!user?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_hidden')
          .eq('user_id', user.id)
          .single();
        
        if (error) {
          console.error('[SettingsScreen] Failed to load profile hidden status:', error);
        } else {
          setHideProfile(data?.is_hidden ?? false);
        }
      } catch (error) {
        console.error('[SettingsScreen] Error loading profile hidden status:', error);
      } finally {
        setLoadingHideProfile(false);
      }
    };

    loadProfileHidden();
  }, [user?.id]);

  const handleToggleHideProfile = async (value: boolean) => {
    // Optimistically update UI
    setHideProfile(value);
    
    try {
      await setProfileHidden(value);
    } catch (error) {
      // Revert on error
      setHideProfile(!value);
      Alert.alert(
        'Error',
        'Failed to update profile visibility. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleLogOut = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/(onboarding)/welcome');
          },
        },
      ]
    );
  };

  const handlePermanentDeleteAccount = () => {
    setPermanentDeleteConfirm('');
    setShowPermanentDeleteModal(true);
  };

  const handleConfirmPermanentDelete = async () => {
    if (deletingPermanently) return;

    // Validate confirmation text
    if (permanentDeleteConfirm.trim() !== 'DELETE') {
      Alert.alert('Invalid confirmation', 'Please type DELETE exactly to confirm.');
      return;
    }

    // Immediately set deletion flag to prevent bootstrap operations
    setDeletingAccount(true);
    setDeletingPermanently(true);

    // Immediately navigate to deleting-account screen BEFORE server call
    // This prevents TabLayout from mounting/bootstrapping during deletion
    router.replace('/(onboarding)/deleting-account');

    try {
      // Delete account permanently via Edge Function
      await deleteAccountPermanently();
      
      // Clear app caches/state
      resetMeCache();
      
      // Sign out
      await signOut();
      
      // Reset deletion flag (optional, since we're signed out)
      setDeletingAccount(false);
      
      // Navigate to welcome screen
      router.replace('/(onboarding)/welcome');
      
      // Show confirmation (using Alert since we're navigating away)
      setTimeout(() => {
        Alert.alert('Account deleted', 'Your account has been permanently deleted.');
      }, 500);
    } catch (error) {
      console.error('[SettingsScreen] Failed to delete account permanently:', error);
      
      // Reset deletion flag on error
      setDeletingAccount(false);
      setDeletingPermanently(false);
      
      // Navigate back to settings on error
      router.replace('/(tabs)/account/settings');
      
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to delete account permanently. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleCancelPermanentDelete = () => {
    if (deletingPermanently) return;
    setShowPermanentDeleteModal(false);
    setPermanentDeleteConfirm('');
  };

  const handleResetDislikes = async (lanes: Array<'pals' | 'match'>) => {
    if (resettingDislikes) return;

    setResettingDislikes(true);
    try {
      // CRITICAL: Clear pending outbox events BEFORE calling reset
      // This prevents re-applying suppressions after reset
      await clearDislikeOutbox(lanes);
      
      // Reset dislikes on the server
      await resetDislikes(lanes);
      
      // Mark lanes for refresh so feed screen clears their state
      await markLanesForRefresh(lanes);
      
      setShowResetDislikesModal(false);
      Alert.alert(
        'Success', 
        'Dislikes have been reset. The feed will refresh automatically.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back to feed - it will refresh on focus
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/index');
              }
            }
          }
        ]
      );
    } catch (error: any) {
      console.error('[SettingsScreen] Failed to reset dislikes:', error);
      Alert.alert('Error', error.message || 'Failed to reset dislikes. Please try again.');
    } finally {
      setResettingDislikes(false);
    }
  };

  const settingsItems = [
    {
      id: 'hide',
      title: 'Hide my profile',
      subtitle: 'Hide your profile from showing up on others feed',
      type: 'switch' as const,
      value: hideProfile,
      onValueChange: handleToggleHideProfile,
      disabled: loadingHideProfile,
    },
    {
      id: 'notifications',
      title: 'Notifications',
      subtitle: 'Manage your notification preferences',
      type: 'switch' as const,
      value: notificationsEnabled,
      onValueChange: setNotificationsEnabled,
      disabled: true, // Will work on this later
    },
    {
      id: 'blocked',
      title: 'Blocked Users',
      subtitle: 'View and manage blocked users',
      type: 'navigation' as const,
      onPress: () => router.push('/(tabs)/account/settings/blocked-users'),
    },
    {
      id: 'subscription',
      title: 'Subscription',
      subtitle: currentSubscription 
        ? `Current plan: ${currentSubscription}` 
        : 'View and manage your subscription',
      type: 'navigation' as const,
      onPress: () => router.push('/(tabs)/account/settings/subscription'),
    },
    {
      id: 'resetDislikes',
      title: 'Reset Dislikes',
      subtitle: 'Clear your rejected profiles and see them again',
      type: 'navigation' as const,
      onPress: () => setShowResetDislikesModal(true),
    },
    {
      id: 'legal',
      title: 'Legal',
      subtitle: 'Privacy Policy, Terms & Conditions',
      type: 'navigation' as const,
      onPress: () => {
        Alert.alert('Legal', 'Legal pages will be implemented later.');
      },
    },
  ];

  return (
    <ScreenContainer>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          {settingsItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.settingItem,
                item.disabled && styles.settingItemDisabled,
              ]}
              onPress={item.type === 'navigation' ? item.onPress : undefined}
              disabled={item.disabled}
            >
              <View style={styles.settingContent}>
                <AppText variant="body" style={styles.settingTitle}>
                  {item.title}
                </AppText>
                <AppText variant="caption" style={styles.settingSubtitle}>
                  {item.subtitle}
                </AppText>
              </View>
              {item.type === 'switch' && (
                <Switch
                  value={item.value}
                  onValueChange={item.onValueChange}
                  disabled={item.disabled}
                />
              )}
              {item.type === 'navigation' && (
                <AppText variant="body" style={styles.chevron}>
                  →
                </AppText>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <AppButton
            variant="ghost"
            onPress={handleLogOut}
            style={styles.logOutButton}
          >
            Log Out
          </AppButton>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.deleteButton, styles.permanentDeleteButton]}
            onPress={handlePermanentDeleteAccount}
            disabled={deletingPermanently}
          >
            <AppText variant="body" style={styles.permanentDeleteButtonText}>
              Delete Account Permanently
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Permanent Delete Account Confirmation Modal */}
      <Modal
        visible={showPermanentDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelPermanentDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <AppText variant="heading" style={styles.modalTitle}>
              Delete Account Permanently?
            </AppText>
            <AppText variant="body" style={styles.modalText}>
              This action cannot be undone. All your data, photos, and account information will be permanently deleted.
            </AppText>
            <AppText variant="body" style={[styles.modalText, styles.warningText]}>
              Type <AppText style={{ fontWeight: 'bold' }}>DELETE</AppText> to confirm:
            </AppText>
            
            <View style={styles.reasonInputContainer}>
              <TextInput
                style={styles.reasonInput}
                value={permanentDeleteConfirm}
                onChangeText={setPermanentDeleteConfirm}
                placeholder="DELETE"
                placeholderTextColor={Colors.text + '50'}
                editable={!deletingPermanently}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.modalButtons}>
              <AppButton
                variant="ghost"
                style={styles.modalButton}
                onPress={handleCancelPermanentDelete}
                disabled={deletingPermanently}
              >
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                style={[styles.modalButton, styles.permanentDeleteConfirmButton]}
                onPress={handleConfirmPermanentDelete}
                disabled={deletingPermanently || permanentDeleteConfirm.trim() !== 'DELETE'}
              >
                {deletingPermanently ? (
                  <ActivityIndicator size="small" color={Colors.background} />
                ) : (
                  'Delete Forever'
                )}
              </AppButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Dislikes Modal */}
      <ResetDislikesModal
        visible={showResetDislikesModal}
        onClose={() => setShowResetDislikesModal(false)}
        onSubmit={handleResetDislikes}
        loading={resettingDislikes}
        palsEnabled={me.preferencesRaw.pals_enabled}
        matchEnabled={me.preferencesRaw.match_enabled}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  settingItemDisabled: {
    opacity: 0.5,
  },
  settingContent: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingTitle: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  settingSubtitle: {
    opacity: 0.7,
  },
  chevron: {
    opacity: 0.5,
  },
  logOutButton: {
    width: '100%',
  },
  deleteButton: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: Colors.error,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    marginBottom: Spacing.md,
    fontWeight: 'bold',
  },
  modalText: {
    marginBottom: Spacing.lg,
    opacity: 0.8,
  },
  reasonInputContainer: {
    marginBottom: Spacing.lg,
  },
  reasonLabel: {
    marginBottom: Spacing.xs,
    opacity: 0.7,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.2)',
    borderRadius: 8,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: 14,
    minHeight: 80,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'flex-end',
  },
  modalButton: {
    flex: 1,
  },
  deleteConfirmButton: {
    backgroundColor: Colors.error,
  },
  permanentDeleteButton: {
    backgroundColor: Colors.error,
    borderWidth: 2,
    borderColor: Colors.error,
  },
  permanentDeleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  warningText: {
    marginTop: Spacing.md,
    fontWeight: '600',
    color: Colors.error,
  },
  permanentDeleteConfirmButton: {
    backgroundColor: Colors.error,
  },
});

