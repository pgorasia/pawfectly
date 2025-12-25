/**
 * AI detector interface and types
 */

import { DetectorResult } from './photo';

/**
 * Pluggable interface for AI entity detection
 * This allows swapping implementations without changing UI code
 */
export interface EntityDetector {
  /**
   * Detects entities (dog, human) in an image
   * @param imageUri - Local URI of the image to analyze
   * @returns Promise with detection results: { dog: boolean, human: boolean, confidence?: number }
   */
  detectEntities(imageUri: string): Promise<DetectorResult>;
  
  /**
   * Checks if image contains NSFW/inappropriate content
   * @param imageUri - Local URI of the image to analyze
   * @returns Promise<boolean> - true if safe, false if inappropriate
   */
  checkNSFW(imageUri: string): Promise<boolean>;
}

