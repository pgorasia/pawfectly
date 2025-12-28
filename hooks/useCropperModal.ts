import { useState, useCallback } from 'react';
import { CropperTransform } from '../components/media/CropperModal';

interface UseCropperModalReturn {
  isOpen: boolean;
  imageUri: string | null;
  openCropper: (uri: string) => Promise<CropperTransform | null>;
  closeCropper: () => void;
  handleConfirm: (transform: CropperTransform) => void;
}

/**
 * Hook for managing the cropper modal with promise-based API
 * 
 * Usage:
 * ```tsx
 * const { isOpen, imageUri, openCropper, closeCropper, handleConfirm } = useCropperModal();
 * 
 * // In your component:
 * <CropperModal
 *   visible={isOpen}
 *   imageUri={imageUri || ''}
 *   onCancel={closeCropper}
 *   onConfirm={handleConfirm}
 * />
 * 
 * // To open:
 * const handleImagePick = async () => {
 *   const result = await openCropper('file://path/to/image.jpg');
 *   if (result) {
 *     console.log('Transform:', result);
 *   }
 * };
 * ```
 */
export function useCropperModal(): UseCropperModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [resolvePromise, setResolvePromise] = useState<
    ((value: CropperTransform | null) => void) | null
  >(null);

  const openCropper = useCallback((uri: string): Promise<CropperTransform | null> => {
    return new Promise<CropperTransform | null>((resolve) => {
      setImageUri(uri);
      setIsOpen(true);
      setResolvePromise(() => resolve);
    });
  }, []);

  const closeCropper = useCallback(() => {
    setIsOpen(false);
    if (resolvePromise) {
      resolvePromise(null);
      setResolvePromise(null);
    }
    // Clear image URI after a short delay to allow modal to close
    setTimeout(() => {
      setImageUri(null);
    }, 300);
  }, [resolvePromise]);

  const handleConfirm = useCallback(
    (transform: CropperTransform) => {
      setIsOpen(false);
      if (resolvePromise) {
        resolvePromise(transform);
        setResolvePromise(null);
      }
      // Clear image URI after a short delay to allow modal to close
      setTimeout(() => {
        setImageUri(null);
      }, 300);
    },
    [resolvePromise]
  );

  return {
    isOpen,
    imageUri,
    openCropper,
    closeCropper,
    handleConfirm,
  };
}

