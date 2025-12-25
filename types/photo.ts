/**
 * Photo-related type definitions
 */

export type BucketType = 'dog' | 'human';
export type TargetType = 'dog' | 'human'; // What to look for in the photo

export type PhotoStatus = 'pending' | 'approved' | 'rejected';

export interface Photo {
  id: string;
  user_id: string;
  dog_id: string | null;
  bucket_type: BucketType;
  target_type: TargetType; // What to look for: 'dog' for dog bucket, 'human' for human bucket
  storage_path: string;
  width?: number;
  height?: number;
  created_at: string;
  status: PhotoStatus;
  contains_dog: boolean;
  contains_human: boolean;
  // contains_both is computed as: contains_dog && contains_human
  rejection_reason?: string | null;
}

export interface PhotoUploadResult {
  photo: Photo;
  error?: string;
}

export type TrustBadgeType = 'HUMAN_DOG_PHOTO' | 'EMAIL_VERIFIED' | string;

export interface TrustBadge {
  user_id: string;
  badge_type: TrustBadgeType;
  earned_at: string;
}

export interface PhotoBucketState {
  photos: Photo[];
  isUploading: boolean;
  uploadError: string | null;
}

