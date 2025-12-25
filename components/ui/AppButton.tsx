import React from 'react';
import { Pressable, PressableProps, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { AppText } from './AppText';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { ButtonVariant } from '../../types/ui';

interface AppButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

export const AppButton: React.FC<AppButtonProps> = ({
  variant = 'primary',
  disabled = false,
  loading = false,
  children,
  style,
  ...props
}) => {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        (pressed || isDisabled) && styles.disabled,
        style,
      ]}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary' || variant === 'secondary'
              ? Colors.background
              : Colors.primary
          }
          size="small"
        />
      ) : (
        <AppText
          variant="body"
          color={
            variant === 'primary' || variant === 'secondary'
              ? 'background'
              : 'primary'
          }
          style={styles.buttonText}
        >
          {children}
        </AppText>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primary: {
    backgroundColor: Colors.primary,
  },
  secondary: {
    backgroundColor: Colors.secondary,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '600',
  },
});

