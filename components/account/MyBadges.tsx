import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import { useMe } from '@/contexts/MeContext';
import type { BadgeType } from '@/services/badges/badgeService';

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

function MyBadgesContent({ padded }: { padded?: boolean }) {
  const router = useRouter();
  const { me, meLoaded, refreshBadges } = useMe();
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [selectedBadgeInfo, setSelectedBadgeInfo] = useState<BadgeInfo | null>(null);

  useEffect(() => {
    if (meLoaded && (!me.badges || me.badges.length === 0)) {
      refreshBadges().catch((error) => {
        console.error('[MyBadges] Failed to refresh badges:', error);
      });
    }
  }, [meLoaded, me.badges, refreshBadges]);

  const badgeStatusesFromMe = (me.badges || []).map((badge) => ({
    type: badge.type as BadgeType,
    earned: badge.earned,
    earnedAt: badge.earnedAt,
    metadata: badge.metadata,
  }));

  const statusesByType = new Map<
    BadgeType,
    {
      type: BadgeType;
      earned: boolean;
      earnedAt: string | null;
      metadata: Record<string, any> | null;
    }
  >();

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
    if (earned) return;

    if (badgeType === 'photo_with_dog') {
      router.push('/(tabs)/account/profile-trust?tab=photos');
    } else if (badgeType === 'selfie_verified') {
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

  if (!meLoaded) {
    return (
      <View style={[styles.loadingContainer, padded && styles.padded]}>
        <AppText variant="body">Loading badges...</AppText>
      </View>
    );
  }

  return (
    <View style={[styles.section, padded && styles.padded]}>
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
            <View style={styles.badgeLeft}>
              <View style={[styles.checkbox, isCompleted && styles.checkboxChecked]}>
                {isCompleted && (
                  <AppText variant="body" style={styles.checkmark}>
                    ✓
                  </AppText>
                )}
              </View>
            </View>

            <View style={styles.badgeCenter}>
              <AppText
                variant="body"
                style={[styles.badgeLabel, isCompleted && styles.badgeLabelCompleted]}
              >
                {info.label}
              </AppText>
              {info.description && (
                <AppText variant="caption" style={styles.badgeDescription}>
                  {info.description}
                </AppText>
              )}
            </View>

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
                <IconSymbol
                  name="info.circle"
                  size={20}
                  color={isCompleted ? Colors.text + '80' : Colors.primary}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}

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
    </View>
  );
}

export function MyBadgesInline() {
  return <MyBadgesContent />;
}

export function MyBadgesScreen() {
  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentContainer}>
      <MyBadgesContent padded />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
  },
  tabContentContainer: {
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  padded: {
    padding: Spacing.lg,
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
});

