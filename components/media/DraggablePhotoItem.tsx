/**
 * Draggable Photo Item Component
 * Handles drag-and-drop reordering of photos with cross-row support
 */

import React, { useCallback } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Colors } from '@/constants/colors';
import { Spacing } from '@/constants/spacing';
import type { Photo } from '@/types/photo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH_PERCENT = 0.3; // 30% of container width
const GAP = Spacing.sm;
const ITEMS_PER_ROW = 3;

interface DraggablePhotoItemProps {
  photo: Photo;
  index: number;
  imageUrl: string | null;
  isRejected: boolean;
  onPress: () => void;
  onRemove: () => void;
  onDragEnd: (fromIndex: number, toIndex: number) => void;
  containerWidth?: number;
}

export const DraggablePhotoItem: React.FC<DraggablePhotoItemProps> = ({
  photo,
  index,
  imageUrl,
  isRejected,
  onPress,
  onRemove,
  onDragEnd,
  containerWidth = SCREEN_WIDTH,
}) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const isDragging = useSharedValue(false);

  // Calculate item dimensions
  const itemWidth = (containerWidth - Spacing.lg * 2) * ITEM_WIDTH_PERCENT;
  const itemHeight = itemWidth; // Square aspect ratio
  const itemWidthWithGap = itemWidth + GAP;
  const itemHeightWithGap = itemHeight + Spacing.xs; // Include bottom margin

  const longPressGesture = Gesture.LongPress()
    .minDuration(200)
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.1);
      opacity.value = 0.8;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const columnsMoved = Math.round(event.translationX / itemWidthWithGap);
      const rowsMoved = Math.round(event.translationY / itemHeightWithGap);
      const targetIndex = index + (rowsMoved * ITEMS_PER_ROW) + columnsMoved;

      // Reset position
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      opacity.value = withSpring(1);
      isDragging.value = false;

      // Only trigger reorder if moved to a different position
      if (targetIndex !== index && targetIndex >= 0) {
        runOnJS(onDragEnd)(index, targetIndex);
      }
    });

  const composedGesture = Gesture.Simultaneous(longPressGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      opacity: opacity.value,
      zIndex: isDragging.value ? 1000 : 1,
    };
  });

  const handleRemove = useCallback(
    (e: any) => {
      e.stopPropagation();
      onRemove();
    },
    [onRemove]
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.container,
          { width: itemWidth },
          isRejected && styles.rejected,
          animatedStyle,
        ]}
      >
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.9}
          style={styles.photoTouchable}
        >
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="image-outline" size={24} color={Colors.text} />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.removeButton}
          onPress={handleRemove}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash" size={18} color={Colors.background} />
        </TouchableOpacity>
        {photo.contains_dog && photo.contains_human && !isRejected && (
          <View style={styles.badge}>
            <Ionicons name="trophy" size={16} color={Colors.background} />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: Spacing.xs,
  },
  rejected: {
    borderWidth: 2,
    borderColor: Colors.error,
  },
  photoTouchable: {
    width: '100%',
    height: '100%',
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.text + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 4,
  },
});
