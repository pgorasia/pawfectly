import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { useAuth } from '@/contexts/AuthContext';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const [hideProfile, setHideProfile] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  // Mock subscription status - in production, this would come from Supabase
  const [currentSubscription] = useState<string | null>('3 Months Premium');

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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // In production, this would call a Supabase function to delete the account
            Alert.alert('Account Deletion', 'Account deletion is not yet implemented.');
          },
        },
      ]
    );
  };

  const settingsItems = [
    {
      id: 'hide',
      title: 'Hide',
      subtitle: 'Hide your profile from showing up on others feed',
      type: 'switch' as const,
      value: hideProfile,
      onValueChange: setHideProfile,
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
      id: 'subscription',
      title: 'Subscription',
      subtitle: currentSubscription 
        ? `Current plan: ${currentSubscription}` 
        : 'View and manage your subscription',
      type: 'navigation' as const,
      onPress: () => router.push('/(tabs)/account/settings/subscription'),
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
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <AppText variant="body" style={styles.backButton}>
              ← Back
            </AppText>
          </TouchableOpacity>
          <AppText variant="heading" style={styles.title}>
            Settings
          </AppText>
        </View>

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
            style={styles.deleteButton}
            onPress={handleDeleteAccount}
          >
            <AppText variant="body" style={styles.deleteButtonText}>
              Delete Account
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  header: {
    marginBottom: Spacing.xl,
  },
  backButton: {
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
  title: {
    marginBottom: Spacing.sm,
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
});

