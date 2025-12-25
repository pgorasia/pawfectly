import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Typography } from '../../constants/typography';
import { TextVariant, TextColor } from '../../types/ui';

interface AppTextProps extends Omit<TextProps, 'style'> {
  variant?: TextVariant;
  color?: TextColor;
  style?: TextProps['style'];
}

export const AppText: React.FC<AppTextProps> = ({
  variant = 'body',
  color = 'text',
  style,
  children,
  ...props
}) => {
  const textColor = color in Colors ? Colors[color as keyof typeof Colors] : color;

  return (
    <Text
      style={[
        styles.base,
        styles[variant],
        { color: textColor },
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  base: {
    color: Colors.text,
  },
  heading: {
    fontSize: Typography.heading.fontSize,
    fontWeight: '600',
  },
  body: {
    fontSize: Typography.body.fontSize,
  },
  caption: {
    fontSize: Typography.caption.fontSize,
  },
});

