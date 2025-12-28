# Photo Cropper Specification

## Overview
A reusable cropper modal component that allows users to adjust photos with pinch-to-zoom and pan gestures before confirming. The cropper displays a 4:5 aspect ratio frame overlay and returns transform state (not the actual cropped image).

## Component: CropperModal

### Props
- `visible: boolean` - Controls modal visibility
- `imageUri: string` - URI of the image to display
- `onCancel: () => void` - Callback when user cancels
- `onConfirm: (transform: CropperTransform) => void` - Callback when user confirms, receives transform state

### Transform Output
```typescript
interface CropperTransform {
  scale: number;        // Zoom level (1.0 - 3.0)
  translateX: number;   // Horizontal pan offset
  translateY: number;   // Vertical pan offset
}
```

## UI Specifications

### Crop Frame
- **Aspect Ratio**: 4:5 (width:height)
- **Width**: 85% of screen width
- **Height**: width × 5/4
- **Border**: 2px, white/subtle
- **Position**: Centered on screen

### Gestures
- **Pinch to Zoom**: Range 1.0x to 3.0x
- **Pan/Drag**: Constrained to keep image within frame bounds
- **Simultaneous**: Both gestures work together

### Visual Design
- **Backdrop**: Dark overlay (90% opacity black)
- **Empty Space**: Black fill when image doesn't cover frame
- **Instruction Text**: "Pinch to zoom, drag to adjust" (top center)
- **Buttons**: 
  - Cancel (left, ghost variant)
  - Use Photo (right, primary variant)
  - Positioned at bottom with spacing

### Image Rendering
- Uses `expo-image` for rendering
- `contentFit="contain"` to maintain aspect ratio
- Black background fills empty space

## Hook: useCropperModal

### API
```typescript
const {
  isOpen: boolean,
  imageUri: string | null,
  openCropper: (uri: string) => Promise<CropperTransform | null>,
  closeCropper: () => void,
  handleConfirm: (transform: CropperTransform) => void,
} = useCropperModal();
```

### Usage Pattern
```typescript
// Open cropper and wait for result
const result = await openCropper(imageUri);
if (result) {
  // User confirmed with transform
  console.log('Scale:', result.scale);
  console.log('Translate:', result.translateX, result.translateY);
} else {
  // User cancelled
}
```

## Technical Details

### Dependencies
- `react-native-gesture-handler` (~2.28.0) - Gesture recognition
- `react-native-reanimated` (~4.1.1) - Smooth animations
- `expo-image` (~3.0.11) - Image rendering

### Constraints
- Zoom range: 1.0 (min) to 3.0 (max)
- Pan is constrained to prevent image from moving outside frame
- Transform state is returned, not the actual cropped image

### Output Format
- Final image format target: JPEG (not implemented in this module)
- Transform state is returned for later processing

## Future Implementation Notes
- Actual cropping/export will be implemented in a later module
- Transform state will be used to crop the image to 4:5 ratio
- Export will produce JPEG format

