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

export async function purchaseConsumable(
  type: ConsumableType,
  quantity: number
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('purchase_consumable', {
    p_type: type,
    p_quantity: quantity,
  });

  if (error) {
    console.error('[consumablesService] purchase_consumable failed:', error);
    throw new Error(error.message);
  }

  return (data || {}) as any;
}

export async function consumeMyConsumable(
  type: ConsumableType,
  quantity: number = 1
): Promise<{ ok: boolean; error?: string; unlimited?: boolean }> {
  const { data, error } = await supabase.rpc('consume_my_consumable', {
    p_type: type,
    p_quantity: quantity,
  });

  if (error) {
    console.error('[consumablesService] consume_my_consumable failed:', error);
    throw new Error(error.message);
  }

  return (data || {}) as any;
}

