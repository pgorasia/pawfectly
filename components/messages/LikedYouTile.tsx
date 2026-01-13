import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface LikedYouTileProps {
  count: number;
  onPress: () => void;
}

export function LikedYouTile({ count, onPress }: LikedYouTileProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="favorite" size={24} color={Colors.primary} />
      </View>
      <View style={styles.content}>
        <AppText variant="caption" style={styles.title} numberOfLines={2}>
          {count} {count === 1 ? 'person wants' : 'people want'} to connect with you
        </AppText>
        <AppText variant="caption" style={styles.cta}>
          View their profile &gt;
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 200,
    backgroundColor: Colors.primary + '10',
    borderRadius: 16,
    padding: Spacing.md,
    marginRight: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    alignSelf: 'center',
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  cta: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '500',
    textAlign: 'center',
  },
});
