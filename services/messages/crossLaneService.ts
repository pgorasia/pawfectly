import { supabase } from '@/services/supabase/supabaseClient';

/**
 * Cross-lane connections:
 * - Created when there is mutual interest across lanes (one side Pals, other Match).
 * - The Pals-liker is the chooser (they decide Pals vs Match).
 * - Pending connections are visible ONLY to the chooser on the Liked You screen.
 */

export type CrossLaneChoice = 'pals' | 'match';

export interface ResolveCrossLaneResult {
  ok: boolean;
  conversation_id?: string;
  lane?: CrossLaneChoice;
  error?: string;
  expires_at?: string;
}

export type CrossLanePendingMessage = {
  sender_id: string | null;
  body: string;
  metadata: any;
  created_at: string;
  client_message_id?: string | null;
  lane?: CrossLaneChoice | null;
};

export interface CrossLanePendingDetails {
  ok: boolean;
  error?: string;
  pals_user_id?: string;
  match_user_id?: string;
  created_at?: string;
  expires_at?: string;
  is_chooser?: boolean;
  message?: CrossLanePendingMessage | null;
}

/**
 * Resolve a pending cross-lane connection (chooser only).
 * RPC: public.resolve_cross_lane_connection(p_other_id uuid, p_selected_lane text)
 */
export async function resolveCrossLaneConnection(
  otherId: string,
  selectedLane: CrossLaneChoice
): Promise<ResolveCrossLaneResult> {
  const { data, error } = await supabase.rpc('resolve_cross_lane_connection', {
    p_other_id: otherId,
    p_selected_lane: selectedLane,
  });

  if (error) {
    console.error('[crossLaneService] resolve_cross_lane_connection failed:', error);
    throw new Error(`Failed to resolve cross-lane: ${error.message}`);
  }

  return (data ?? { ok: false, error: 'unknown_error' }) as ResolveCrossLaneResult;
}

/**
 * Fetch cross-lane pending details for the dedicated UI screen.
 * RPC: public.get_cross_lane_pending(p_other_id uuid)
 */
export async function getCrossLanePending(otherId: string): Promise<CrossLanePendingDetails> {
  const { data, error } = await supabase.rpc('get_cross_lane_pending', {
    p_other_id: otherId,
  });

  if (error) {
    console.error('[crossLaneService] get_cross_lane_pending failed:', error);
    throw new Error(`Failed to load cross-lane pending: ${error.message}`);
  }

  return (data ?? { ok: false, error: 'unknown_error' }) as CrossLanePendingDetails;
}
