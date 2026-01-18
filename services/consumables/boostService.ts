import { supabase } from '@/services/supabase/supabaseClient';

export type MyBoostStatus =
  | {
      is_active: true;
      started_at: string;
      ends_at: string;
      remaining_seconds: number;
    }
  | {
      is_active: false;
      started_at: null;
      ends_at: null;
      remaining_seconds: number;
    };

export async function getMyBoostStatus(): Promise<MyBoostStatus> {
  const { data, error } = await supabase.rpc('get_my_boost_status');
  if (error) {
    console.error('[boostService] get_my_boost_status failed:', error);
    throw new Error(error.message);
  }

  const rows = (data || []) as any[];
  return (rows[0] || { is_active: false, started_at: null, ends_at: null, remaining_seconds: 0 }) as MyBoostStatus;
}

export async function startMyBoost(): Promise<{ ok: boolean; error?: string; started_at?: string; ends_at?: string }> {
  const { data, error } = await supabase.rpc('start_my_boost');
  if (error) {
    console.error('[boostService] start_my_boost failed:', error);
    throw new Error(error.message);
  }
  return (data || {}) as any;
}

