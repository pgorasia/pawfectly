/**
 * Image picker service
 * Handles image selection from device gallery/camera
 */

import * as ImagePicker from 'expo-image-picker';

export interface ImagePickerOptions {
  allowsEditing?: boolean;
  quality?: number;
  aspect?: [number, number];
}

export interface PickedImage {
  uri: string;
  width?: number;
  height?: number;
  type?: string;
  fileName?: string;
}

/**
 * Requests camera permissions
 */
export async function requestCameraPermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

/**
 * Requests media library permissions
 */
export async function requestMediaLibraryPermissions(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Picks an image from the device gallery
 */
export async function pickImageFromGallery(
  options: ImagePickerOptions = {}
): Promise<PickedImage | null> {
  const hasPermission = await requestMediaLibraryPermissions();
  if (!hasPermission) {
    throw new Error('Media library permission not granted');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    // Note: MediaTypeOptions is deprecated but MediaType doesn't exist in v17 yet
    // Using MediaTypeOptions for now - it still works, just shows a warning
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: options.allowsEditing ?? false,
    quality: options.quality ?? 0.8,
    aspect: options.aspect,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    type: asset.type,
    fileName: asset.fileName,
  };
}

/**
 * Takes a photo using the device camera
 */
export async function takePhoto(
  options: ImagePickerOptions = {}
): Promise<PickedImage | null> {
  const hasPermission = await requestCameraPermissions();
  if (!hasPermission) {
    throw new Error('Camera permission not granted');
  }

  const result = await ImagePicker.launchCameraAsync({
    // Note: MediaTypeOptions is deprecated but MediaType doesn't exist in v17 yet
    // Using MediaTypeOptions for now - it still works, just shows a warning
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: options.allowsEditing ?? false,
    quality: options.quality ?? 0.8,
    aspect: options.aspect,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    type: asset.type,
    fileName: asset.fileName,
  };
}

/**
 * Shows action sheet to choose between camera and gallery
 * Returns the picked image or null if cancelled
 */
export async function pickImage(
  options: ImagePickerOptions = {}
): Promise<PickedImage | null> {
  // For now, default to gallery
  // TODO: Add action sheet UI component to choose camera vs gallery
  return pickImageFromGallery(options);
}

