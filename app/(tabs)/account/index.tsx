import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useMe } from '@/contexts/MeContext';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';
import MyPackTab from './MyPackTab';
import OurPhotosTab from './OurPhotosTab';
import type { BadgeType } from '@/services/badges/badgeService';

type AccountTab = 'pack' | 'photos' | 'badges';

interface BadgeInfo {
  type: BadgeType;
  label: string;
  description?: string;
  infoText: string;
}

const BADGE_INFO: Record<BadgeType, BadgeInfo> = {
  email_verified: {
    type: 'email_verified',
    label: 'Email Verified',
    infoText: 'Your email address has been verified.',
  },
  photo_with_dog: {
    type: 'photo_with_dog',
    label: 'Photo with Dog',
    infoText: 'Upload at least one photo where you and your dog are clearly visible.',
  },
  selfie_verified: {
    type: 'selfie_verified',
    label: 'Selfie Verified',
    infoText: 'Take a quick selfie that matches one of your profile photos.',
  },
};

function MyBadgesTab() {
  const router = useRouter();
  const { me, meLoaded, refreshBadges } = useMe();
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [selectedBadgeInfo, setSelectedBadgeInfo] = useState<BadgeInfo | null>(null);

  // Use badges from MeContext (cached). If they are missing, refresh once.
  useEffect(() => {
    if (meLoaded && (!me.badges || me.badges.length === 0)) {
      refreshBadges().catch((error) => {
        console.error('[MyBadgesTab] Failed to refresh badges:', error);
      });
    }
  }, [meLoaded, me.badges, refreshBadges]);

  // Normalize statuses and always render all known badge types (earned or not).
  const badgeStatusesFromMe = (me.badges || []).map((badge) => ({
    type: badge.type as BadgeType,
    earned: badge.earned,
    earnedAt: badge.earnedAt,
    metadata: badge.metadata,
  }));

  const statusesByType = new Map<BadgeType, {
    type: BadgeType;
    earned: boolean;
    earnedAt: string | null;
    metadata: Record<string, any> | null;
  }>();

  for (const status of badgeStatusesFromMe) {
    statusesByType.set(status.type, status);
  }

  const badgeTypes: BadgeType[] = ['email_verified', 'photo_with_dog', 'selfie_verified'];

  const badgeRows = badgeTypes.map((type) => {
    return (
      statusesByType.get(type) || {
        type,
        earned: type === 'email_verified',
        earnedAt: null,
        metadata: null,
      }
    );
  });

  const handleBadgePress = (badgeType: BadgeType, earned: boolean) => {
    if (earned) {
      // Completed badges are disabled
      return;
    }

    if (badgeType === 'photo_with_dog') {
      // Navigate to Our Photos tab
      router.push('/(tabs)/account?tab=photos');
    } else if (badgeType === 'selfie_verified') {
      // Start selfie verification flow
      router.push('/(selfie)/intro');
    }
  };

  const handleInfoPress = (badgeType: BadgeType) => {
    const info = BADGE_INFO[badgeType];
    if (info) {
      setSelectedBadgeInfo(info);
      setInfoModalVisible(true);
    }
  };

  // Show loading only if MeContext hasn't loaded yet
  if (!meLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <AppText variant="body">Loading badges...</AppText>
      </View>
    );
  }

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <View style={styles.section}>
        {badgeRows.map((badge) => {
          const info = BADGE_INFO[badge.type];
          if (!info) return null;

          const isCompleted = badge.earned;
          const showTrophy = badge.type !== 'email_verified' && isCompleted;

          return (
            <TouchableOpacity
              key={badge.type}
              style={[styles.badgeRow, isCompleted && styles.badgeRowDisabled]}
              onPress={() => handleBadgePress(badge.type, isCompleted)}
              disabled={isCompleted}
              activeOpacity={isCompleted ? 1 : 0.7}
            >
              {/* Left: Checkbox */}
              <View style={styles.badgeLeft}>
                <View style={[styles.checkbox, isCompleted && styles.checkboxChecked]}>
                  {isCompleted && (
                    <AppText variant="body" style={styles.checkmark}>
                      ✓
                    </AppText>
                  )}
                </View>
              </View>

              {/* Center: Title + Description */}
              <View style={styles.badgeCenter}>
                <AppText variant="body" style={[styles.badgeLabel, isCompleted && styles.badgeLabelCompleted]}>
                  {info.label}
                </AppText>
                {info.description && (
                  <AppText variant="caption" style={styles.badgeDescription}>
                    {info.description}
                  </AppText>
                )}
              </View>

              {/* Right: Trophy + Info Icon */}
              <View style={styles.badgeRight}>
                {showTrophy && (
                  <View style={styles.trophyIcon}>
                    <IconSymbol name="trophy.fill" size={24} color={Colors.primary} />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.infoIcon}
                  onPress={() => handleInfoPress(badge.type)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <IconSymbol name="info.circle" size={20} color={isCompleted ? Colors.text + '80' : Colors.primary} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Info Modal */}
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <AppText variant="heading" style={styles.modalTitle}>
                {selectedBadgeInfo?.label}
              </AppText>
              <TouchableOpacity
                onPress={() => setInfoModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <IconSymbol name="xmark" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <AppText variant="body" style={styles.modalText}>
              {selectedBadgeInfo?.infoText}
            </AppText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setInfoModalVisible(false)}
            >
              <AppText variant="body" style={styles.modalButtonText}>
                Got it
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default function AccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<AccountTab>('pack');

  // Handle tab parameter from navigation
  useEffect(() => {
    if (params.tab && (params.tab === 'pack' || params.tab === 'photos' || params.tab === 'badges')) {
      setActiveTab(params.tab as AccountTab);
    }
  }, [params.tab]);

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/preferences?from=account')}
          >
            <IconSymbol name="slider.horizontal.3" size={24} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(tabs)/account/settings')}
          >
            <IconSymbol name="gearshape.fill" size={24} color={Colors.text} />
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
        {activeTab === 'pack' && <MyPackTab onNewDogAdded={() => setActiveTab('photos')} />}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 8,
    marginBottom: Spacing.md,
    minHeight: 60,
  },
  badgeRowDisabled: {
    opacity: 0.6,
  },
  badgeLeft: {
    marginRight: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(31, 41, 55, 0.3)',
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
  badgeCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  badgeLabel: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  badgeLabelCompleted: {
    opacity: 0.7,
  },
  badgeDescription: {
    opacity: 0.6,
    fontSize: 12,
  },
  badgeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  trophyIcon: {
    marginRight: Spacing.xs,
  },
  infoIcon: {
    padding: Spacing.xs,
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
    borderRadius: 16,
    padding: Spacing.lg,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    flex: 1,
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalText: {
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: Colors.background,
    fontWeight: '600',
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

