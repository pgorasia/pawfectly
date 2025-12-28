import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import MyPackTab from './MyPackTab';
import OurPhotosTab from './OurPhotosTab';

type AccountTab = 'pack' | 'photos' | 'badges';

function MyBadgesTab() {
  const { user } = useAuth();
  // Mock verification status - in production, this would come from Supabase
  const [verifications] = useState({
    email: true,
    phone: true,
    photoWithDog: true,
    selfie: false,
    idVerification: false,
  });

  const badges = [
    {
      id: 'email',
      label: 'Email Verified',
      value: user?.email || 'Not set',
      verified: verifications.email,
    },
    {
      id: 'phone',
      label: 'Phone Verified',
      value: '+1 (555) 123-4567', // Mock - in production, get from user profile
      verified: verifications.phone,
    },
    {
      id: 'photoWithDog',
      label: 'Photo with Dog',
      verified: verifications.photoWithDog,
    },
    {
      id: 'selfie',
      label: 'Selfie Verification',
      verified: verifications.selfie,
    },
    {
      id: 'id',
      label: 'ID Verification',
      verified: verifications.idVerification,
    },
  ];

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={styles.section}>
        <AppText variant="heading" style={styles.sectionTitle}>
          Verification Badges
        </AppText>
        {badges.map((badge) => (
          <View key={badge.id} style={styles.badgeItem}>
            <View style={styles.badgeContent}>
              <View style={styles.badgeLeft}>
                {badge.verified ? (
                  <View style={styles.verifiedIcon}>
                    <AppText variant="body" style={styles.checkmark}>
                      ✓
                    </AppText>
                  </View>
                ) : (
                  <View style={styles.unverifiedIcon} />
                )}
                <View style={styles.badgeText}>
                  <AppText variant="body" style={styles.badgeLabel}>
                    {badge.label}
                  </AppText>
                  {badge.value && (
                    <AppText variant="caption" style={styles.badgeValue}>
                      {badge.value}
                    </AppText>
                  )}
                </View>
              </View>
              {badge.verified && (
                <View style={styles.blueTick}>
                  <AppText variant="caption" style={styles.blueTickText}>
                    ✓
                  </AppText>
                </View>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.noteSection}>
        <AppText variant="caption" style={styles.noteText}>
          Completing selfie and ID verification gives you a blue tick on your profile photo and feed swipe card.
        </AppText>
      </View>
    </ScrollView>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AccountTab>('pack');

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/account/settings')}
          >
            <IconSymbol name="gearshape.fill" size={24} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(profile)/preferences')}
          >
            <IconSymbol name="slider.horizontal.3" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pack' && styles.tabActive]}
          onPress={() => setActiveTab('pack')}
        >
          <AppText
            variant="body"
            style={[styles.tabText, activeTab === 'pack' && styles.tabTextActive]}
          >
            My Pack
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'photos' && styles.tabActive]}
          onPress={() => setActiveTab('photos')}
        >
          <AppText
            variant="body"
            style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}
          >
            Our Photos
          </AppText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'badges' && styles.tabActive]}
          onPress={() => setActiveTab('badges')}
        >
          <AppText
            variant="body"
            style={[styles.tabText, activeTab === 'badges' && styles.tabTextActive]}
          >
            My Badges
          </AppText>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {activeTab === 'pack' && <MyPackTab />}
        {activeTab === 'photos' && <OurPhotosTab />}
        {activeTab === 'badges' && <MyBadgesTab />}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  headerSpacer: {
    flex: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  headerButton: {
    padding: Spacing.sm,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31, 41, 55, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    opacity: 0.5,
  },
  tabTextActive: {
    opacity: 1,
    fontWeight: '600',
    color: Colors.primary,
  },
  tabContainer: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  dogCard: {
    padding: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 8,
    marginBottom: Spacing.md,
  },
  dogName: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  dogDetail: {
    opacity: 0.7,
    marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  infoLabel: {
    fontWeight: '600',
    marginRight: Spacing.sm,
    minWidth: 80,
  },
  infoValue: {
    flex: 1,
  },
  placeholderText: {
    opacity: 0.5,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  editButton: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: Colors.background,
    fontWeight: '600',
  },
  badgeItem: {
    marginBottom: Spacing.md,
  },
  badgeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 8,
  },
  badgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  verifiedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  unverifiedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(31, 41, 55, 0.3)',
    marginRight: Spacing.md,
  },
  checkmark: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
  badgeText: {
    flex: 1,
  },
  badgeLabel: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  badgeValue: {
    opacity: 0.7,
  },
  blueTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blueTickText: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: 'bold',
  },
  noteSection: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
  },
  noteText: {
    opacity: 0.8,
    textAlign: 'center',
  },
});

