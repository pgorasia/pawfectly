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
