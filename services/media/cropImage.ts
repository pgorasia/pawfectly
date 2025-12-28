/**
 * Image Cropping Service
 * Crops an image based on transform state to extract the 4:5 crop frame region
 */

import { manipulateAsync, SaveFormat, Action } from 'expo-image-manipulator';
import { Dimensions } from 'react-native';
import type { CropperTransform } from '@/components/media/CropperModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CROP_FRAME_WIDTH = SCREEN_WIDTH * 0.85;
const CROP_FRAME_HEIGHT = CROP_FRAME_WIDTH * (5 / 4); // 4:5 aspect ratio

export interface CropImageParams {
  imageUri: string;
  transform: CropperTransform;
}

/**
 * Crops an image based on the transform state from the cropper modal
 * 
 * The transform represents:
 * - scale: zoom level (1.0 to 3.0)
 * - translateX/Y: pan offset in screen pixels
 * 
 * We need to:
 * 1. Get original image dimensions
 * 2. Calculate what region of the original image corresponds to the crop frame
 * 3. Crop to that region (4:5 aspect ratio)
 * 4. Return the cropped image URI
 */
export async function cropImage(
  params: CropImageParams
): Promise<string> {
  const { imageUri, transform } = params;
  const { scale, translateX, translateY } = transform;

  try {
    // Step 1: Get original image dimensions
    const originalInfo = await manipulateAsync(imageUri, [], {
      format: undefined,
    });

    const originalWidth = originalInfo.width;
    const originalHeight = originalInfo.height;
    const originalAspectRatio = originalWidth / originalHeight;

    // Step 2: Calculate how the image is displayed in the cropper
    // The image container is SCREEN_WIDTH x SCREEN_HEIGHT, and the image uses contentFit="contain"
    // So the image maintains aspect ratio and fits within the container
    
    // Calculate displayed image size (maintaining aspect ratio, fitting in container)
    let displayedWidth: number;
    let displayedHeight: number;
    let imageOffsetX = 0;
    let imageOffsetY = 0;
    
    const screenAspectRatio = SCREEN_WIDTH / SCREEN_HEIGHT;
    
    if (originalAspectRatio > screenAspectRatio) {
      // Image is wider - fit to screen width, center vertically
      displayedWidth = SCREEN_WIDTH;
      displayedHeight = SCREEN_WIDTH / originalAspectRatio;
      imageOffsetY = (SCREEN_HEIGHT - displayedHeight) / 2;
    } else {
      // Image is taller - fit to screen height, center horizontally
      displayedHeight = SCREEN_HEIGHT;
      displayedWidth = SCREEN_HEIGHT * originalAspectRatio;
      imageOffsetX = (SCREEN_WIDTH - displayedWidth) / 2;
    }

    // Apply scale to displayed size
    const scaledWidth = displayedWidth * scale;
    const scaledHeight = displayedHeight * scale;

    // Step 3: Calculate the crop region in the original image
    // 
    // Coordinate system: Screen coordinates (0,0 at top-left)
    // - Crop frame is centered on screen: frameCenter = (SCREEN_WIDTH/2, SCREEN_HEIGHT/2)
    // - Image container is SCREEN_WIDTH x SCREEN_HEIGHT, centered initially
    // - Image inside container is displayedWidth x displayedHeight (before scale), centered
    // - Transform moves the container by (translateX, translateY)
    // - After scale, image is scaledWidth x scaledHeight
    //
    // To find what part of the image is visible inside the crop frame:
    // 1. Find crop frame bounds in screen coordinates
    // 2. Find image bounds in screen coordinates (accounting for transform)
    // 3. Find intersection = what's visible inside the frame
    // 4. Convert intersection from screen coords -> scaled image coords -> original image coords
    
    // Crop frame bounds in screen coordinates (frame is centered)
    const frameLeft = (SCREEN_WIDTH - CROP_FRAME_WIDTH) / 2;
    const frameRight = frameLeft + CROP_FRAME_WIDTH;
    const frameTop = (SCREEN_HEIGHT - CROP_FRAME_HEIGHT) / 2;
    const frameBottom = frameTop + CROP_FRAME_HEIGHT;
    
    // Image container bounds in screen coordinates
    // Container is SCREEN_WIDTH x SCREEN_HEIGHT, centered initially at (0, 0) to (SCREEN_WIDTH, SCREEN_HEIGHT)
    // Transform moves the container by (translateX, translateY)
    // So container bounds are:
    const containerLeft = translateX;
    const containerRight = translateX + SCREEN_WIDTH;
    const containerTop = translateY;
    const containerBottom = translateY + SCREEN_HEIGHT;
    
    // Image bounds within container (image is centered in container, then scaled)
    // Image is displayedWidth x displayedHeight (before scale), centered in container
    // After scale, it's scaledWidth x scaledHeight, still centered in container
    const imageLeftInContainer = (SCREEN_WIDTH - scaledWidth) / 2;
    const imageRightInContainer = imageLeftInContainer + scaledWidth;
    const imageTopInContainer = (SCREEN_HEIGHT - scaledHeight) / 2;
    const imageBottomInContainer = imageTopInContainer + scaledHeight;
    
    // Image bounds in screen coordinates (container position + image position within container)
    const imageLeftInScreen = containerLeft + imageLeftInContainer;
    const imageRightInScreen = containerLeft + imageRightInContainer;
    const imageTopInScreen = containerTop + imageTopInContainer;
    const imageBottomInScreen = containerTop + imageBottomInContainer;
    
    // Find intersection: what part of the image is inside the crop frame
    const intersectionLeft = Math.max(frameLeft, imageLeftInScreen);
    const intersectionRight = Math.min(frameRight, imageRightInScreen);
    const intersectionTop = Math.max(frameTop, imageTopInScreen);
    const intersectionBottom = Math.min(frameBottom, imageBottomInScreen);
    
    // Check if there's any intersection
    if (intersectionLeft >= intersectionRight || intersectionTop >= intersectionBottom) {
      throw new Error('Crop frame does not intersect with image');
    }
    
    // Convert intersection from screen coordinates to image-relative coordinates
    // Image-relative coords: (0,0) is top-left of the scaled image
    const cropLeftInScaled = intersectionLeft - imageLeftInScreen;
    const cropTopInScaled = intersectionTop - imageTopInScreen;
    const cropRightInScaled = intersectionRight - imageLeftInScreen;
    const cropBottomInScaled = intersectionBottom - imageTopInScreen;
    
    // Ensure crop is within image bounds
    const clampedCropLeft = Math.max(0, Math.min(cropLeftInScaled, scaledWidth));
    const clampedCropTop = Math.max(0, Math.min(cropTopInScaled, scaledHeight));
    const clampedCropRight = Math.max(clampedCropLeft, Math.min(cropRightInScaled, scaledWidth));
    const clampedCropBottom = Math.max(clampedCropTop, Math.min(cropBottomInScaled, scaledHeight));
    
    const clampedCropWidth = clampedCropRight - clampedCropLeft;
    const clampedCropHeight = clampedCropBottom - clampedCropTop;
    
    // Convert from scaled displayed image coordinates to original image coordinates
    const scaleToOriginalX = originalWidth / scaledWidth;
    const scaleToOriginalY = originalHeight / scaledHeight;

    const cropX = Math.round(clampedCropLeft * scaleToOriginalX);
    const cropY = Math.round(clampedCropTop * scaleToOriginalY);
    const cropWidth = Math.round(clampedCropWidth * scaleToOriginalX);
    const cropHeight = Math.round(clampedCropHeight * scaleToOriginalY);

    // Ensure we have valid crop dimensions
    if (cropWidth <= 0 || cropHeight <= 0) {
      throw new Error('Invalid crop dimensions calculated');
    }

    // Step 4: Ensure the crop maintains 4:5 aspect ratio
    // Calculate the target aspect ratio
    const targetAspectRatio = 4 / 5; // width:height = 4:5
    const currentAspectRatio = cropWidth / cropHeight;

    let finalCropWidth = cropWidth;
    let finalCropHeight = cropHeight;
    let finalCropX = cropX;
    let finalCropY = cropY;

    if (currentAspectRatio > targetAspectRatio) {
      // Crop is wider than 4:5 - adjust width to match
      finalCropWidth = Math.round(cropHeight * targetAspectRatio);
      // Center the crop horizontally
      finalCropX = cropX + Math.round((cropWidth - finalCropWidth) / 2);
    } else {
      // Crop is taller than 4:5 - adjust height to match
      finalCropHeight = Math.round(cropWidth / targetAspectRatio);
      // Center the crop vertically
      finalCropY = cropY + Math.round((cropHeight - finalCropHeight) / 2);
    }

    // Ensure crop is within image bounds
    finalCropX = Math.max(0, Math.min(finalCropX, originalWidth - finalCropWidth));
    finalCropY = Math.max(0, Math.min(finalCropY, originalHeight - finalCropHeight));
    finalCropWidth = Math.min(finalCropWidth, originalWidth - finalCropX);
    finalCropHeight = Math.min(finalCropHeight, originalHeight - finalCropY);

    // Step 5: Crop the image to the calculated region
    const actions: Action[] = [
      {
        crop: {
          originX: finalCropX,
          originY: finalCropY,
          width: finalCropWidth,
          height: finalCropHeight,
        },
      },
    ];

    // Step 6: Crop and return the cropped image URI
    const croppedResult = await manipulateAsync(imageUri, actions, {
      format: SaveFormat.JPEG,
      compress: 1.0, // Don't compress yet - will compress during resize/upload
    });

    return croppedResult.uri;
  } catch (error) {
    console.error('[cropImage] Failed to crop image:', error);
    throw new Error(
      `Failed to crop image: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

