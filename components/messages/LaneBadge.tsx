import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { type Lane } from '@/services/messages/messagesService';

export type LaneBadgeValue = Lane | 'unknown';

interface LaneBadgeProps {
  lane: LaneBadgeValue;
  style?: any;
}

export function LaneBadge({ lane, style }: LaneBadgeProps) {
  const emoji = lane === 'pals' ? '🐾' : lane === 'match' ? '💛' : '?';

  return (
    <View style={[styles.badge, style]}>
      <AppText variant="caption" style={styles.badgeText}>
        {emoji}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
