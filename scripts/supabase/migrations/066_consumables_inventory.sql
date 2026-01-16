-- Migration: Consumables inventory + renewal tracking
-- Adds per-user balances and next renewal timestamp for consumables.
-- This supports showing "uses left" + "renews in X days" in the UI.

-- ============================================================================
-- TABLE: user_consumables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_consumables (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consumable_type TEXT NOT NULL CHECK (consumable_type IN ('boost','rewind','compliment','reset_dislikes')),
  balance INT NOT NULL DEFAULT 0,
  -- Next renewal timestamp (e.g. weekly). NULL means no renewal schedule (pay-per-use).
  renews_at TIMESTAMPTZ NULL,
  -- Optional informational period length (for UI + future logic).
  renewal_period_days INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, consumable_type)
);

CREATE INDEX IF NOT EXISTS idx_user_consumables_user
  ON public.user_consumables(user_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.user_consumables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own consumables" ON public.user_consumables;
CREATE POLICY "Users can read their own consumables"
  ON public.user_consumables
  FOR SELECT
  USING (auth.uid() = user_id);

-- NOTE:
-- We intentionally do NOT allow direct INSERT/UPDATE from clients.
-- Balances should be mutated by server-side logic (billing/webhooks/RPCs).

-- ============================================================================
-- RPC: ensure_user_consumables
-- Creates default rows lazily for the authenticated user.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_user_consumables()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Weekly-renewing consumables (defaults to 0 balance until billing is wired).
  INSERT INTO public.user_consumables(user_id, consumable_type, balance, renews_at, renewal_period_days)
  VALUES
    (v_user_id, 'boost', 0, NOW() + INTERVAL '7 days', 7),
    (v_user_id, 'rewind', 0, NOW() + INTERVAL '7 days', 7),
    (v_user_id, 'compliment', 0, NOW() + INTERVAL '7 days', 7)
  ON CONFLICT (user_id, consumable_type) DO NOTHING;

  -- Pay-per-use (no renewal schedule).
  INSERT INTO public.user_consumables(user_id, consumable_type, balance, renews_at, renewal_period_days)
  VALUES
    (v_user_id, 'reset_dislikes', 0, NULL, NULL)
  ON CONFLICT (user_id, consumable_type) DO NOTHING;
END;
$$;

ALTER FUNCTION public.ensure_user_consumables() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.ensure_user_consumables() TO authenticated;

-- ============================================================================
-- RPC: get_my_consumables
-- Ensures defaults exist, then returns balances for UI.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_consumables()
RETURNS TABLE(
  consumable_type text,
  balance int,
  renews_at timestamptz,
  renewal_period_days int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.ensure_user_consumables();

  RETURN QUERY
  SELECT
    uc.consumable_type,
    uc.balance,
    uc.renews_at,
    uc.renewal_period_days
  FROM public.user_consumables uc
  WHERE uc.user_id = auth.uid()
  ORDER BY uc.consumable_type;
END;
$$;

ALTER FUNCTION public.get_my_consumables() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_my_consumables() TO authenticated;

