import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { toPublicPhotoUrl, type SentRequest } from '@/services/messages/messagesService';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface SentRequestTileProps {
  request: SentRequest;
  onPress: () => void;
}

export function SentRequestTile({ request, onPress }: SentRequestTileProps) {
  const photoUrl = toPublicPhotoUrl(request.thumb_storage_path ?? request.hero_storage_path);
  
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
            <AppText variant="caption" style={styles.avatarText}>
              {request.display_name?.[0]?.toUpperCase() || '?'}
            </AppText>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <AppText variant="caption" style={styles.name} numberOfLines={1}>
          {request.display_name}
        </AppText>
        <AppText variant="caption" style={styles.status}>
          Pending
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(31, 41, 55, 0.05)',
    borderRadius: 24,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginRight: Spacing.sm,
  },
  avatarContainer: {
    marginRight: Spacing.xs,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  status: {
    fontSize: 12,
    color: Colors.text,
    opacity: 0.5,
  },
});
