import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

export default function FeedScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push('/(profile)/preferences')}
          >
            <IconSymbol name="slider.horizontal.3" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <AppText variant="heading" style={styles.title}>
          Feed Coming Soon
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Your feed of potential connections will appear here.
        </AppText>
        <AppText variant="caption" style={styles.note}>
          Note: Feed will only show profiles with lifecycle_status in ('active','limited') and only approved photos.
        </AppText>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  note: {
    marginTop: Spacing.md,
    textAlign: 'center',
    opacity: 0.5,
    fontStyle: 'italic',
  },
});
