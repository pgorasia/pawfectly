import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface LikedYouPlaceholderProps {
  count: number;
  onPress: () => void;
}

export function LikedYouPlaceholder({ count, onPress }: LikedYouPlaceholderProps) {
  return (
    <View style={styles.container}>
      <AppText variant="body" style={styles.title}>
        {count} {count === 1 ? 'person wants' : 'people want'} to connect with you
      </AppText>
      <Pressable onPress={onPress}>
        <AppText variant="caption" style={styles.cta}>
          View their profiles ›
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: '#fffbe8',
    borderRadius: 12,
    marginHorizontal: Spacing.lg,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  cta: {
    color: '#d47b00',
    fontWeight: '700',
    marginTop: 2,
  },
});
