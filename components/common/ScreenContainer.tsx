import React from 'react';
import { View, ViewProps, StyleSheet, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

interface ScreenContainerProps extends ViewProps {
  children: React.ReactNode;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  showBottomSpacer?: boolean; // Show bottom spacer for Android navigation buttons (letterbox)
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  edges = ['top', 'bottom'],
  showBottomSpacer = false,
  style,
  ...props
}) => {
  const insets = useSafeAreaInsets();
  
  // Calculate bottom spacer height for Android navigation buttons
  const systemBarSpacerHeight = Math.max(insets.bottom, 0);
  const systemBarSpacerColor = Platform.OS === 'android' ? '#000000' : Colors.background;

  return (
    <SafeAreaView
      style={[styles.container, style]}
      edges={showBottomSpacer ? ['top'] : edges}
      {...props}
    >
      <View style={styles.content}>
        {children}
      </View>
      {/* System navigation spacer ("letterbox") for Android navigation buttons */}
      {showBottomSpacer && (
        <View style={[styles.systemBarSpacer, { height: systemBarSpacerHeight, backgroundColor: systemBarSpacerColor }]} />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  systemBarSpacer: {
    width: '100%',
  },
});

