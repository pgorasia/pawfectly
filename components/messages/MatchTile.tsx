import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { LaneBadge, type LaneBadgeValue } from './LaneBadge';
import { toPublicPhotoUrl, type Match } from '@/services/messages/messagesService';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface MatchTileProps {
  match: Match;
  onPress: () => void;
}

export function MatchTile({ match, onPress }: MatchTileProps) {
  const photoUrl = toPublicPhotoUrl(match.thumb_storage_path ?? match.hero_storage_path);
  const badgeLane = (match.badge_lane ?? match.lane) as LaneBadgeValue;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarContainer}>
        {photoUrl ? (
          <Image
            source={{
              uri: photoUrl,
            }}
            style={styles.avatar}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.placeholderAvatar}>
            <AppText variant="heading" style={styles.placeholderText}>
              {match.dog_name?.[0] || match.display_name?.[0] || '?'}
            </AppText>
          </View>
        )}

        <View style={styles.badgeContainer}>
          <LaneBadge lane={badgeLane} />
        </View>
      </View>

      <AppText variant="caption" style={styles.name} numberOfLines={1}>
        {match.display_name}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 80,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.xs,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.cardBackground,
  },
  placeholderAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 24,
  },
  badgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 2,
  },
  name: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
});
