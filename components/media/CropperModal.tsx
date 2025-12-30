import React, { useEffect } from 'react';
import { View, StyleSheet, Modal, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  clamp,
} from 'react-native-reanimated';
import { AppButton } from '../ui/AppButton';
import { AppText } from '../ui/AppText';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CROP_FRAME_WIDTH = SCREEN_WIDTH * 0.85;
const CROP_FRAME_HEIGHT = CROP_FRAME_WIDTH * (5 / 4); // 4:5 aspect ratio
const MIN_SCALE = 0.3; // Allow zooming out to 30% of original size
const MAX_SCALE = 3.0; // Allow zooming in to 300% of original size

export interface CropperTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

interface CropperModalProps {
  visible: boolean;
  imageUri: string;
  onCancel: () => void;
  onConfirm: (transform: CropperTransform) => void;
}

export const CropperModal: React.FC<CropperModalProps> = ({
  visible,
  imageUri,
  onCancel,
  onConfirm,
}) => {
  const scale = useSharedValue(1.0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1.0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset transforms when modal opens
  useEffect(() => {
    if (visible) {
      scale.value = 1.0;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1.0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible]);

  // Pinch gesture
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      'worklet';
      // Save current values when gesture starts
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      'worklet';
      const newScale = clamp(
        savedScale.value * event.scale,
        MIN_SCALE,
        MAX_SCALE
      );
      scale.value = newScale;
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
    });

  // Pan gesture - unlimited movement
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      // Save current values when gesture starts
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      // Allow unlimited panning - no constraints
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Combine gestures - use Simultaneous so both can work together
  // Pinch (2 fingers) and Pan (1 finger) can work simultaneously
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Animated style for image container
  const imageAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  }, []);

  const handleConfirm = () => {
    // Read current values from shared values
    const currentScale = scale.value;
    const currentTranslateX = translateX.value;
    const currentTranslateY = translateY.value;
    
    onConfirm({
      scale: currentScale,
      translateX: currentTranslateX,
      translateY: currentTranslateY,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.container}>
        {/* Dark backdrop */}
        <View style={styles.backdrop} pointerEvents="none" />

        {/* Gesture detector wrapping a touchable area - use regular View as direct child */}
        <GestureDetector gesture={composedGesture}>
          <View style={styles.gestureWrapper} collapsable={false}>
            <Animated.View 
              style={[styles.imageContainer, imageAnimatedStyle]}
              collapsable={false}
            >
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Instruction text */}
        <View style={styles.instructionContainer} pointerEvents="none">
          <AppText variant="caption" color={Colors.background} style={styles.instruction}>
            Pinch to zoom, drag to adjust
          </AppText>
        </View>

        {/* Crop frame overlay */}
        <View style={styles.cropFrame} pointerEvents="none" />

        {/* Overlay mask (darken areas outside crop frame) */}
        <View style={styles.overlayTop} pointerEvents="none" />
        <View style={styles.overlayBottom} pointerEvents="none" />
        <View style={styles.overlayLeft} pointerEvents="none" />
        <View style={styles.overlayRight} pointerEvents="none" />

        {/* Buttons */}
        <View style={styles.buttonContainer} pointerEvents="box-none">
          <AppButton
            variant="ghost"
            onPress={onCancel}
            style={styles.cancelButton}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onPress={handleConfirm}
            style={styles.confirmButton}
          >
            Use Photo
          </AppButton>
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    zIndex: 0,
  },
  gestureWrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000', // Black fill for empty space
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  instructionContainer: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.15,
    alignSelf: 'center',
    zIndex: 10,
  },
  instruction: {
    textAlign: 'center',
  },
  cropFrame: {
    position: 'absolute',
    width: CROP_FRAME_WIDTH,
    height: CROP_FRAME_HEIGHT,
    top: (SCREEN_HEIGHT - CROP_FRAME_HEIGHT) / 2,
    left: (SCREEN_WIDTH - CROP_FRAME_WIDTH) / 2,
    borderWidth: 2,
    borderColor: Colors.background,
    zIndex: 5,
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: (SCREEN_HEIGHT - CROP_FRAME_HEIGHT) / 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  overlayBottom: {
    position: 'absolute',
    top: (SCREEN_HEIGHT + CROP_FRAME_HEIGHT) / 2,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  overlayLeft: {
    position: 'absolute',
    left: 0,
    top: (SCREEN_HEIGHT - CROP_FRAME_HEIGHT) / 2,
    width: (SCREEN_WIDTH - CROP_FRAME_WIDTH) / 2,
    height: CROP_FRAME_HEIGHT,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  overlayRight: {
    position: 'absolute',
    right: 0,
    top: (SCREEN_HEIGHT - CROP_FRAME_HEIGHT) / 2,
    width: (SCREEN_WIDTH - CROP_FRAME_WIDTH) / 2,
    height: CROP_FRAME_HEIGHT,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 2,
    pointerEvents: 'none',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.1,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    zIndex: 10,
  },
  cancelButton: {
    flex: 1,
  },
  confirmButton: {
    flex: 1,
  },
});

