import { supabase } from '@/services/supabase/supabaseClient';

export type MyEntitlements = {
  plan_code: 'free' | 'plus' | string;
  expires_at: string | null;
};

export async function getMyEntitlements(): Promise<MyEntitlements | null> {
  const { data, error } = await supabase.rpc('get_my_entitlements');
  if (error) {
    console.error('[entitlementsService] get_my_entitlements failed:', error);
    throw new Error(error.message);
  }

  const rows = (data || []) as MyEntitlements[];
  return rows[0] ?? null;
}

export function isEntitlementActive(ent: MyEntitlements | null, planCode: string): boolean {
  if (!ent) return false;
  if (ent.plan_code !== planCode) return false;
  if (!ent.expires_at) return true;
  const ts = new Date(ent.expires_at).getTime();
  return Number.isFinite(ts) ? ts > Date.now() : false;
}

