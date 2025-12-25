import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Spacing } from '@/constants/spacing';
import { Colors } from '@/constants/colors';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <AppText variant="heading" style={styles.title}>
            Welcome to Pawfectly! 🐾
          </AppText>
          <AppText variant="body" style={styles.subtitle}>
            A warm, dog-first place where your pup can lead the way to new friends and connections.
          </AppText>
          <AppText variant="body" style={styles.description}>
            We believe dogs are the heart of every great connection. Let's get started by meeting your furry friend!
          </AppText>
        </View>
        <View style={styles.buttonContainer}>
          <AppButton
            variant="primary"
            onPress={() => router.push('/(auth)')}
            style={styles.button}
          >
            Get Started
          </AppButton>
          <TouchableOpacity
            onPress={() => router.push('/(auth)?mode=signin')}
            style={styles.signInLink}
          >
            <AppText variant="body" style={styles.signInText}>
              Sign in
            </AppText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.xxl,
  },
  title: {
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: Spacing.md,
    textAlign: 'center',
    opacity: 0.8,
  },
  description: {
    marginTop: Spacing.lg,
    textAlign: 'center',
    opacity: 0.7,
  },
  buttonContainer: {
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  button: {
    width: '100%',
  },
  signInLink: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  signInText: {
    color: Colors.primary,
  },
});

