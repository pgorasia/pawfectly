import React from 'react';
import { View, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  stepTitles: string[];
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentStep,
  totalSteps,
  stepTitles,
}) => {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <View style={styles.container}>
      <View style={styles.barContainer}>
        <View style={styles.barBackground}>
          <View style={[styles.barFill, { width: `${progress}%` }]} />
        </View>
      </View>
      <View style={styles.stepsContainer}>
        {stepTitles.map((title, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === currentStep;
          const isCompleted = stepNumber < currentStep;
          
          return (
            <View key={index} style={styles.step}>
              <View
                style={[
                  styles.stepIndicator,
                  isActive && styles.stepIndicatorActive,
                  isCompleted && styles.stepIndicatorCompleted,
                ]}
              >
                {isCompleted && (
                  <AppText variant="caption" color="background" style={styles.checkmark}>
                    ✓
                  </AppText>
                )}
              </View>
              <AppText
                variant="caption"
                style={[
                  styles.stepTitle,
                  isActive && styles.stepTitleActive,
                  isCompleted && styles.stepTitleCompleted,
                ]}
                numberOfLines={1}
              >
                {title}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.background,
  },
  barContainer: {
    marginBottom: Spacing.md,
  },
  barBackground: {
    height: 4,
    backgroundColor: 'rgba(31, 41, 55, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  step: {
    flex: 1,
    alignItems: 'center',
    maxWidth: 100,
  },
  stepIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(31, 41, 55, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  stepIndicatorActive: {
    backgroundColor: Colors.primary,
  },
  stepIndicatorCompleted: {
    backgroundColor: Colors.primary,
  },
  checkmark: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  stepTitle: {
    fontSize: 10,
    textAlign: 'center',
    opacity: 0.5,
  },
  stepTitleActive: {
    opacity: 1,
    fontWeight: '600',
    color: Colors.primary,
  },
  stepTitleCompleted: {
    opacity: 0.7,
  },
});

