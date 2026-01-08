/**
 * Feed-related types
 */

export interface FeedCursor {
  updated_at: string;
  user_id: string;
}

/**
 * Profile view payload returned by get_profile_view RPC
 */
export interface ProfileViewPayload {
  candidate: {
    user_id: string;
    display_name: string | null;
    city: string | null;
  };
  labels: {
    dog_label: string;
    distance_miles: number | null;
    is_verified: boolean;
  };
  hero_photo: {
    id: string;
    storage_path: string;
    bucket_type: 'human' | 'dog' | null;
  } | null;
  dogs: Array<{
    id: string;
    slot: number;
    name: string;
    breed: string | null;
    age_group: string | null;
    size: string;
    energy: string;
    play_styles: string[];
    temperament: string | null;
  }>;
  prompts: Array<{
    id: string;
    dog_slot: number | null;
    prompt_text: string;
    response_text: string | null;
  }>;
  photos: Array<{
    id: string;
    storage_path: string;
    bucket_type: 'human' | 'dog';
    dog_slot: number | null;
    contains_human: boolean;
    contains_dog: boolean;
  }>;
  compatibility: {
    tier: string | null;
    score: number | null;
    why: string[];
    best_pair: {
      candidate_dog_slot: number;
      viewer_dog_slot: number;
    } | null;
  };
}
