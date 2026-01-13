/**
 * Deleting Account Screen
 * Shown while account deletion is in progress
 */

import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

export default function DeletingAccountScreen() {
  return (
    <ScreenContainer showBottomSpacer={true}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <AppText variant="heading" style={styles.title}>
          Deleting Account...
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Please wait while we permanently delete your account and all associated data.
        </AppText>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  title: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: Spacing.lg,
  },
});
