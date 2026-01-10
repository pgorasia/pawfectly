import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface LikedYouPlaceholderProps {
  count: number;
  onPress: () => void;
}

export function LikedYouPlaceholder({ count, onPress }: LikedYouPlaceholderProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="favorite" size={28} color={Colors.primary} />
      </View>
      <View style={styles.content}>
        <AppText variant="body" style={styles.title}>
          {count} {count === 1 ? 'person wants' : 'people want'} to connect with you
        </AppText>
        <AppText variant="caption" style={styles.subtitle}>
          View their profiles →
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '10',
    borderRadius: 16,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
});
