import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

// Mock data - in production, this would come from Supabase
const MOCK_LIKED_PROFILES = [
  { id: '1', name: 'Alex', age: 28, image: null },
  { id: '2', name: 'Jordan', age: 32, image: null },
  { id: '3', name: 'Sam', age: 25, image: null },
  { id: '4', name: 'Taylor', age: 30, image: null },
  { id: '5', name: 'Casey', age: 27, image: null },
  { id: '6', name: 'Morgan', age: 29, image: null },
];

export default function LikedYouScreen() {
  const [isPremium, setIsPremium] = React.useState(false);

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {!isPremium && (
          <View style={styles.premiumBanner}>
            <AppText variant="heading" style={styles.premiumTitle}>
              Unlock Who Liked You
            </AppText>
            <AppText variant="body" style={styles.premiumSubtitle}>
              See who's interested in connecting with you
            </AppText>
            <AppButton
              variant="primary"
              onPress={() => setIsPremium(true)}
              style={styles.premiumButton}
            >
              Upgrade to Premium
            </AppButton>
          </View>
        )}

        <View style={styles.grid}>
          {MOCK_LIKED_PROFILES.map((profile) => (
            <View key={profile.id} style={styles.tile}>
              {isPremium ? (
                <View style={styles.tileContent}>
                  <View style={styles.avatar}>
                    <AppText variant="heading" style={styles.avatarText}>
                      {profile.name[0]}
                    </AppText>
                  </View>
                  <AppText variant="body" style={styles.tileName}>
                    {profile.name}
                  </AppText>
                  <AppText variant="caption" style={styles.tileAge}>
                    {profile.age}
                  </AppText>
                </View>
              ) : (
                <View style={styles.blurredTile}>
                  <View style={styles.blurOverlay} />
                  <View style={styles.blurredContent}>
                    <View style={styles.avatar}>
                      <AppText variant="heading" style={styles.avatarText}>
                        {profile.name[0]}
                      </AppText>
                    </View>
                    <AppText variant="body" style={styles.tileName}>
                      {profile.name}
                    </AppText>
                    <AppText variant="caption" style={styles.tileAge}>
                      {profile.age}
                    </AppText>
                  </View>
                </View>
              )}
            </View>
          ))}
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
  premiumBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    alignItems: 'center',
  },
  premiumTitle: {
    color: Colors.background,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  premiumSubtitle: {
    color: Colors.background,
    opacity: 0.9,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  premiumButton: {
    minWidth: 200,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'space-between',
  },
  tile: {
    width: '47%',
    aspectRatio: 0.75,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(31, 41, 55, 0.1)',
    marginBottom: Spacing.md,
  },
  tileContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  blurredTile: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
  },
  blurredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
    opacity: 0.3,
    zIndex: 1,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: {
    color: Colors.background,
    fontSize: 24,
  },
  tileName: {
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  tileAge: {
    opacity: 0.7,
    textAlign: 'center',
  },
});

