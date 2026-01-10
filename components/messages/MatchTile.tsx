import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { LaneBadge } from './LaneBadge';
import { toPublicPhotoUrl, type Match } from '@/services/messages/messagesService';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface MatchTileProps {
  match: Match;
  onPress: () => void;
}

export function MatchTile({ match, onPress }: MatchTileProps) {
  const photoUrl = toPublicPhotoUrl(match.hero_storage_path);
  
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarContainer}>
        {photoUrl ? (
          <Image 
            source={{ uri: photoUrl }} 
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <AppText variant="heading" style={styles.avatarText}>
              {match.display_name?.[0]?.toUpperCase() || '?'}
            </AppText>
          </View>
        )}
        <View style={styles.badgeContainer}>
          <LaneBadge lane={match.lane} />
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
    alignItems: 'center',
    width: 80,
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
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontSize: 24,
    fontWeight: '600',
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
