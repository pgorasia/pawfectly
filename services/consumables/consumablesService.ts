import { supabase } from '@/services/supabase/supabaseClient';

export type ConsumableType = 'boost' | 'rewind' | 'compliment' | 'reset_dislikes';

export type MyConsumable = {
  consumable_type: ConsumableType;
  balance: number;
  renews_at: string | null;
  renewal_period_days: number | null;
};

export async function getMyConsumables(): Promise<MyConsumable[]> {
  const { data, error } = await supabase.rpc('get_my_consumables');
  if (error) {
    console.error('[consumablesService] get_my_consumables failed:', error);
    throw new Error(error.message);
  }

  return (data || []) as MyConsumable[];
}

