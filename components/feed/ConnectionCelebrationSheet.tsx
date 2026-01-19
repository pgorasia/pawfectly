import React, { useMemo, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { AppText } from '@/components/ui/AppText';
import { AppButton } from '@/components/ui/AppButton';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';

export type CelebrationKind = 'pals' | 'match' | 'cross_lane';

export type ConnectionCelebrationSheetProps = {
  visible: boolean;
  onDismiss: () => void;

  kind: CelebrationKind;
  peerName: string;
  peerPhotoUrl: string | null;
  myPhotoUrl: string | null;

  primaryCtaLabel: string;
  onPrimaryCta: () => void;

  secondaryCtaLabel?: string;
  onSecondaryCta?: () => void;
};

export function ConnectionCelebrationSheet({
  visible,
  onDismiss,
  kind,
  peerName,
  peerPhotoUrl,
  myPhotoUrl,
  primaryCtaLabel,
  onPrimaryCta,
  secondaryCtaLabel,
  onSecondaryCta,
}: ConnectionCelebrationSheetProps) {
  const translateY = useRef(new Animated.Value(0)).current;

  const title = useMemo(() => {
    if (kind === 'pals') return "Its a Wag!";
    if (kind === 'match') return "Its a Match!";
    return 'New connection! Choose the vibe.';
  }, [kind]);

  const screen = Dimensions.get('window');
  const pageHeight = Math.min(720, Math.round(screen.height * 0.85));
  const pageWidth = Math.min(520, Math.round(screen.width * 0.92));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          // Only capture a clear downward gesture
          return Math.abs(gestureState.dy) > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        },
        onPanResponderMove: (_evt, gestureState) => {
          const dy = Math.max(0, gestureState.dy);
          translateY.setValue(dy);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const dy = Math.max(0, gestureState.dy);
          if (dy > 90) {
            translateY.setValue(0);
            onDismiss();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        },
      }),
    [onDismiss, translateY]
  );

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <Animated.View
            style={[
              styles.page,
              { height: pageHeight, width: pageWidth, transform: [{ translateY }] },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.handle} />

            <AppText variant="heading" style={styles.title}>
              {title}
            </AppText>

            <View style={styles.photoStage}>
              <View style={[styles.photoCard, styles.photoCardLeft]}>
                {peerPhotoUrl ? (
                  <Image source={{ uri: peerPhotoUrl }} style={styles.photo} contentFit="cover" />
                ) : (
                  <View style={[styles.photo, styles.photoFallback]}>
                    <AppText variant="heading" style={styles.photoFallbackText}>
                      {peerName?.[0] || '?'}
                    </AppText>
                  </View>
                )}
              </View>
              <View style={[styles.photoCard, styles.photoCardRight]}>
                {myPhotoUrl ? (
                  <Image source={{ uri: myPhotoUrl }} style={styles.photo} contentFit="cover" />
                ) : (
                  <View style={[styles.photo, styles.photoFallback]}>
                    <AppText variant="heading" style={styles.photoFallbackText}>
                      You
                    </AppText>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.namesRow}>
              <AppText variant="body" style={styles.nameLeft} numberOfLines={1}>
                {peerName}
              </AppText>
              <AppText variant="body" style={styles.nameRight} numberOfLines={1}>
                You
              </AppText>
            </View>

            <View style={styles.ctaRow}>
              <AppButton variant="primary" onPress={onPrimaryCta} style={styles.ctaButton}>
                {primaryCtaLabel}
              </AppButton>

              {secondaryCtaLabel && onSecondaryCta ? (
                <AppButton variant="ghost" onPress={onSecondaryCta} style={styles.ctaButton}>
                  {secondaryCtaLabel}
                </AppButton>
              ) : null}
            </View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  page: {
    backgroundColor: Colors.background,
    borderRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(31, 41, 55, 0.2)',
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.md,
    fontWeight: '800',
  },
  photoStage: {
    height: 310,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    position: 'relative',
  },
  photoCard: {
    position: 'absolute',
    width: 176,
    height: 252,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: 'rgba(31, 41, 55, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  photoCardLeft: {
    transform: [{ rotate: '-7deg' }, { translateX: -64 }, { translateY: 10 }],
  },
  photoCardRight: {
    transform: [{ rotate: '7deg' }, { translateX: 64 }, { translateY: 10 }],
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  photoFallbackText: {
    color: Colors.background,
    fontWeight: '900',
  },
  namesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  nameLeft: {
    flex: 1,
    textAlign: 'left',
    fontWeight: '700',
    paddingRight: Spacing.md,
  },
  nameRight: {
    flex: 1,
    textAlign: 'right',
    fontWeight: '700',
    paddingLeft: Spacing.md,
  },
  ctaRow: {
    gap: Spacing.md,
    marginTop: 'auto',
  },
  ctaButton: {
    width: '100%',
  },
});

