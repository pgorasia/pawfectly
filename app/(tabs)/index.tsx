import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Spacing } from '@/constants/spacing';

export default function FeedScreen() {
  return (
    <ScreenContainer>
      <View style={styles.content}>
        <AppText variant="heading" style={styles.title}>
          Feed Coming Soon
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Your feed of potential connections will appear here.
        </AppText>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
});
