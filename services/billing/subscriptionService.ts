import { supabase } from '@/services/supabase/supabaseClient';

export type MySubscription = {
  product_code: string;
  status: 'active' | 'expired' | string;
  renews_every_months: 1 | 3 | 6 | number;
  current_period_start: string;
  current_period_end: string;
  auto_renews: boolean;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

export async function getMySubscription(): Promise<MySubscription | null> {
  const { data, error } = await supabase.rpc('get_my_subscription');
  if (error) {
    console.error('[subscriptionService] get_my_subscription failed:', error);
    throw new Error(error.message);
  }
  const rows = (data || []) as MySubscription[];
  return rows[0] ?? null;
}

export async function purchasePlusSubscription(months: 1 | 3 | 6): Promise<{
  ok: boolean;
  product_code?: string;
  expires_at?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('purchase_plus_subscription', { p_months: months });
  if (error) {
    console.error('[subscriptionService] purchase_plus_subscription failed:', error);
    throw new Error(error.message);
  }
  return (data || {}) as any;
}

export async function cancelMySubscription(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('cancel_my_subscription');
  if (error) {
    console.error('[subscriptionService] cancel_my_subscription failed:', error);
    throw new Error(error.message);
  }
  return (data || {}) as any;
}

