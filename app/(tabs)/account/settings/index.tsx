import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthSessionStore } from '@/contexts/AuthSessionStore';
import { useMe } from '@/contexts/MeContext';
import { deleteAccountPermanently } from '@/services/account/settingsService';
import { setProfileHidden } from '@/services/profile/statusRepository';
import { supabase } from '@/services/supabase/supabaseClient';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || 'https://example.com/terms';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://example.com/privacy';

async function openLegalUrl(url: string | undefined, title: string) {
  if (!url) {
    Alert.alert(title, 'This link is not configured yet.');
    return;
  }
  await openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
}

function SectionHeader({ title }: { title: string }) {
  return (
    <AppText variant="caption" style={styles.sectionHeader}>
      {title.toUpperCase()}
    </AppText>
  );
}

function SettingsRow({
  title,
  subtitle,
  right,
  onPress,
  disabled,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const isPressable = !!onPress;
  return (
    <TouchableOpacity
      style={[styles.settingItem, disabled && styles.settingItemDisabled]}
      onPress={onPress}
      disabled={!!disabled}
      activeOpacity={isPressable ? 0.75 : 1}
    >
      <View style={styles.settingContent}>
        <AppText variant="body" style={styles.settingTitle}>
          {title}
        </AppText>
        {!!subtitle && (
          <AppText variant="caption" style={styles.settingSubtitle}>
            {subtitle}
          </AppText>
        )}
      </View>
      <View style={styles.settingRight}>
        {right}
        {isPressable && <AppText variant="body" style={styles.chevron}>→</AppText>}
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ open?: string }>();
  const { signOut, user } = useAuth();
  const { reset: resetMeCache } = useMe();
  const { setDeletingAccount } = useAuthSessionStore();

  const [hideProfile, setHideProfile] = useState(false);
  const [loadingHideProfile, setLoadingHideProfile] = useState(true);

  // Mock subscription status - in production, this would come from Supabase/Billing provider.
  const [currentSubscription] = useState<string | null>('3 Months Premium');

  const [showPermanentDeleteModal, setShowPermanentDeleteModal] = useState(false);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState('');
  const [deletingPermanently, setDeletingPermanently] = useState(false);

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

  // Deep-link support: open delete modal from Trust & Safety.
  useEffect(() => {
    if (params.open === 'delete') {
      setPermanentDeleteConfirm('');
      setShowPermanentDeleteModal(true);
    }
  }, [params.open]);

  const handleToggleHideProfile = async (value: boolean) => {
    setHideProfile(value);
    try {
      await setProfileHidden(value);
    } catch (error) {
      setHideProfile(!value);
      Alert.alert('Error', 'Failed to update profile visibility. Please try again.');
    }
  };

  const handleLogOut = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(onboarding)/welcome');
        },
      },
    ]);
  };

  const handlePermanentDeleteAccount = () => {
    setPermanentDeleteConfirm('');
    setShowPermanentDeleteModal(true);
  };

  const handleConfirmPermanentDelete = async () => {
    if (deletingPermanently) return;
    if (permanentDeleteConfirm.trim() !== 'DELETE') {
      Alert.alert('Invalid confirmation', 'Please type DELETE exactly to confirm.');
      return;
    }

    setDeletingAccount(true);
    setDeletingPermanently(true);
    router.replace('/(onboarding)/deleting-account');

    try {
      await deleteAccountPermanently();
      resetMeCache();
      await signOut();
      setDeletingAccount(false);
      router.replace('/(onboarding)/welcome');
      setTimeout(() => {
        Alert.alert('Account deleted', 'Your account has been permanently deleted.');
      }, 500);
    } catch (error) {
      console.error('[SettingsScreen] Failed to delete account permanently:', error);
      setDeletingAccount(false);
      setDeletingPermanently(false);
      router.replace('/(tabs)/account/settings');
      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Failed to delete account permanently. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleCancelPermanentDelete = () => {
    if (deletingPermanently) return;
    setShowPermanentDeleteModal(false);
    setPermanentDeleteConfirm('');
  };

  const subscriptionSubtitle = useMemo(() => {
    return currentSubscription
      ? `Current plan: ${currentSubscription}`
      : 'Manage or cancel your subscription';
  }, [currentSubscription]);

  return (
    <ScreenContainer>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionHeader title="Privacy" />
          <SettingsRow
            title="Hide profile"
            subtitle="Hide your profile from being shown to others"
            right={
              <Switch
                value={hideProfile}
                onValueChange={handleToggleHideProfile}
                disabled={loadingHideProfile}
              />
            }
          />
          <SettingsRow
            title="Blocked users"
            subtitle="View and manage blocked users"
            onPress={() => router.push('/(tabs)/account/settings/blocked-users')}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader title="Subscription" />
          <SettingsRow
            title="Manage/Cancel subscription"
            subtitle={subscriptionSubtitle}
            onPress={() => router.push('/(tabs)/account/settings/subscription')}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader title="Legal" />
          <SettingsRow
            title="Terms"
            onPress={() => {
              openLegalUrl(TERMS_URL, 'Terms').catch((e) =>
                console.error('[SettingsScreen] Failed to open Terms:', e)
              );
            }}
          />
          <SettingsRow
            title="Privacy policy"
            onPress={() => {
              openLegalUrl(PRIVACY_URL, 'Privacy policy').catch((e) =>
                console.error('[SettingsScreen] Failed to open Privacy policy:', e)
              );
            }}
          />
        </View>

        <View style={styles.section}>
          <AppButton variant="ghost" onPress={handleLogOut} style={styles.logOutButton}>
            Log Out
          </AppButton>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.deleteButton, styles.permanentDeleteButton]}
            onPress={handlePermanentDeleteAccount}
            disabled={deletingPermanently}
            activeOpacity={0.8}
          >
            <AppText variant="body" style={styles.permanentDeleteButtonText}>
              Delete Account Permanently
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showPermanentDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelPermanentDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <AppText variant="heading" style={styles.modalTitle}>
              Delete Account Permanently?
            </AppText>
            <AppText variant="body" style={styles.modalText}>
              This action cannot be undone. All your data, photos, and account information will be
              permanently deleted.
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
  sectionHeader: {
    opacity: 0.6,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 12,
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
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
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
  reasonInput: {
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.2)',
    borderRadius: 8,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: 14,
    minHeight: 44,
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
  permanentDeleteButton: {
    backgroundColor: Colors.error,
    borderWidth: 2,
    borderColor: Colors.error,
    borderRadius: 12,
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

