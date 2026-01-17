-- ============================================================================
-- Migration: Stub billing (no RevenueCat yet) + subscriptions + consumable tracking
--
-- Goal:
-- - Allow the app to "assume success" on purchase taps while still exercising
--   the full database update path (entitlements, subscription periods, renewals).
-- - Support subscriptions that auto-renew (1/3/6 months) unless canceled.
-- - Support consumables that can be included in subscription AND sold separately.
--
-- Notes:
-- - This migration is defensive: it adds missing tables/columns if needed.
-- - Clients do NOT get direct write access; all mutations go through RPCs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Entitlements schema hardening (user_entitlements + entitlement_plans)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- entitlement_plans (optional metadata; some environments may already have it)
  IF to_regclass('public.entitlement_plans') IS NULL THEN
    CREATE TABLE public.entitlement_plans (
      plan_code text PRIMARY KEY,
      display_name text NULL,
      description text NULL,
      is_active boolean NOT NULL DEFAULT true,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  -- user_entitlements exists in early migrations, but schema evolved. Ensure the
  -- columns used throughout the app are present.
  IF to_regclass('public.user_entitlements') IS NULL THEN
    CREATE TABLE public.user_entitlements (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      plan_code text NOT NULL DEFAULT 'free',
      expires_at timestamptz NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_entitlements' AND column_name='plan_code'
  ) THEN
    ALTER TABLE public.user_entitlements
      ADD COLUMN plan_code text NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_entitlements' AND column_name='expires_at'
  ) THEN
    ALTER TABLE public.user_entitlements
      ADD COLUMN expires_at timestamptz NULL;
  END IF;

  -- Backfill plan_code from older "tier" column if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_entitlements' AND column_name='tier'
  ) THEN
    UPDATE public.user_entitlements
      SET plan_code = COALESCE(plan_code, tier);
  END IF;

  -- Ensure plan_code is NOT NULL + default
  UPDATE public.user_entitlements
    SET plan_code = COALESCE(plan_code, 'free')
    WHERE plan_code IS NULL;

  BEGIN
    ALTER TABLE public.user_entitlements ALTER COLUMN plan_code SET NOT NULL;
  EXCEPTION WHEN others THEN
    -- If some environments have constraints that prevent this, keep going.
    NULL;
  END;

  BEGIN
    ALTER TABLE public.user_entitlements ALTER COLUMN plan_code SET DEFAULT 'free';
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- FK to entitlement_plans if possible (best-effort; do not fail migration)
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'user_entitlements_plan_code_fkey'
    ) THEN
      ALTER TABLE public.user_entitlements
        ADD CONSTRAINT user_entitlements_plan_code_fkey
        FOREIGN KEY (plan_code) REFERENCES public.entitlement_plans(plan_code);
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;
END $$;

-- RLS: clients can read their own entitlements, but can't write directly.
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.user_entitlements TO authenticated;

DROP POLICY IF EXISTS user_entitlements_select_self ON public.user_entitlements;
CREATE POLICY user_entitlements_select_self
  ON public.user_entitlements
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Subscriptions table (stubbed; future RevenueCat webhook can write here)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  product_code text NOT NULL, -- e.g. plus_m1 / plus_m3 / plus_m6
  status text NOT NULL CHECK (status IN ('active','expired')),
  renews_every_months int NOT NULL CHECK (renews_every_months IN (1,3,6)),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  auto_renews boolean NOT NULL DEFAULT true,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user
  ON public.user_subscriptions(user_id);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.user_subscriptions TO authenticated;

DROP POLICY IF EXISTS user_subscriptions_select_self ON public.user_subscriptions;
CREATE POLICY user_subscriptions_select_self
  ON public.user_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Consumables: split included vs purchased + unlimited flag
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.user_consumables') IS NULL THEN
    CREATE TABLE public.user_consumables (
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      consumable_type TEXT NOT NULL CHECK (consumable_type IN ('boost','rewind','compliment','reset_dislikes')),
      -- Total remaining (kept for backward compatibility with existing UI)
      balance INT NOT NULL DEFAULT 0,
      -- Purchased balance never expires (e.g. bought packs)
      purchased_balance INT NOT NULL DEFAULT 0,
      -- Included balance is granted by subscription and resets per renewal period
      included_total INT NOT NULL DEFAULT 0,
      included_remaining INT NOT NULL DEFAULT 0,
      -- Unlimited means consumption is allowed without decrement (e.g. Plus rewind)
      unlimited boolean NOT NULL DEFAULT false,
      -- Renewal timestamp. NULL means no renewal schedule.
      renews_at TIMESTAMPTZ NULL,
      -- Optional informational period length (days or months) for UI + logic.
      renewal_period_days INT NULL,
      renewal_period_months INT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, consumable_type)
    );
  ELSE
    -- Add missing columns if the table already exists (from earlier migrations).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_consumables' AND column_name='purchased_balance'
    ) THEN
      ALTER TABLE public.user_consumables ADD COLUMN purchased_balance int NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_consumables' AND column_name='included_total'
    ) THEN
      ALTER TABLE public.user_consumables ADD COLUMN included_total int NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_consumables' AND column_name='included_remaining'
    ) THEN
      ALTER TABLE public.user_consumables ADD COLUMN included_remaining int NOT NULL DEFAULT 0;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_consumables' AND column_name='unlimited'
    ) THEN
      ALTER TABLE public.user_consumables ADD COLUMN unlimited boolean NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_consumables' AND column_name='renewal_period_months'
    ) THEN
      ALTER TABLE public.user_consumables ADD COLUMN renewal_period_months int NULL;
    END IF;

    -- Backfill purchased_balance from legacy balance where purchased_balance is still 0.
    UPDATE public.user_consumables
      SET purchased_balance = GREATEST(balance, 0)
      WHERE purchased_balance = 0 AND balance > 0;
  END IF;
END $$;

ALTER TABLE public.user_consumables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own consumables" ON public.user_consumables;
CREATE POLICY "Users can read their own consumables"
  ON public.user_consumables
  FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4) Internal helpers (best-effort "lazy sync" on reads)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._sync_my_subscription_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_sub public.user_subscriptions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_sub
  FROM public.user_subscriptions s
  WHERE s.user_id = v_me
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Ensure we at least have a free entitlements row.
    INSERT INTO public.user_entitlements(user_id, plan_code, expires_at, updated_at)
    VALUES (v_me, 'free', NULL, now())
    ON CONFLICT (user_id) DO UPDATE
      SET plan_code = COALESCE(public.user_entitlements.plan_code, 'free'),
          updated_at = now();
    RETURN;
  END IF;

  -- Auto-renew: if active and not canceled, advance periods until current_period_end is in the future.
  IF v_sub.status = 'active'
     AND v_sub.auto_renews = true
     AND v_sub.cancel_at_period_end = false
  THEN
    WHILE v_sub.current_period_end <= v_now LOOP
      v_sub.current_period_start := v_sub.current_period_end;
      v_sub.current_period_end := v_sub.current_period_end + (v_sub.renews_every_months || ' months')::interval;
    END LOOP;

    UPDATE public.user_subscriptions
      SET current_period_start = v_sub.current_period_start,
          current_period_end = v_sub.current_period_end,
          updated_at = now()
      WHERE user_id = v_me;
  END IF;

  -- Expire at period end if canceled and time is up
  IF v_sub.cancel_at_period_end = true AND v_sub.current_period_end <= v_now THEN
    UPDATE public.user_subscriptions
      SET status = 'expired',
          auto_renews = false,
          updated_at = now()
      WHERE user_id = v_me;
  END IF;

  -- Sync entitlements from subscription (one-sided premium gating uses expires_at)
  SELECT * INTO v_sub
  FROM public.user_subscriptions s
  WHERE s.user_id = v_me;

  IF v_sub.status = 'active' AND v_sub.current_period_end > v_now THEN
    INSERT INTO public.user_entitlements(user_id, plan_code, expires_at, updated_at)
    VALUES (v_me, 'plus', v_sub.current_period_end, now())
    ON CONFLICT (user_id) DO UPDATE
      SET plan_code = 'plus',
          expires_at = EXCLUDED.expires_at,
          updated_at = now();
  ELSE
    INSERT INTO public.user_entitlements(user_id, plan_code, expires_at, updated_at)
    VALUES (v_me, 'free', NULL, now())
    ON CONFLICT (user_id) DO UPDATE
      SET plan_code = 'free',
          expires_at = NULL,
          updated_at = now();
  END IF;
END;
$$;

ALTER FUNCTION public._sync_my_subscription_state() SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public._ensure_my_consumables_rows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.user_consumables(
    user_id, consumable_type, balance, purchased_balance,
    included_total, included_remaining, unlimited,
    renews_at, renewal_period_days, renewal_period_months
  )
  VALUES
    (v_me, 'boost', 0, 0, 0, 0, false, NULL, 7, NULL),
    (v_me, 'rewind', 0, 0, 0, 0, false, NULL, 7, NULL),
    (v_me, 'compliment', 0, 0, 0, 0, false, NULL, 7, NULL),
    (v_me, 'reset_dislikes', 0, 0, 0, 0, false, NULL, NULL, NULL)
  ON CONFLICT (user_id, consumable_type) DO NOTHING;
END;
$$;

ALTER FUNCTION public._ensure_my_consumables_rows() SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public._sync_my_consumables_state()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_now timestamptz := now();
  v_is_plus boolean := false;
  v_row public.user_consumables%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM public._sync_my_subscription_state();
  PERFORM public._ensure_my_consumables_rows();

  SELECT EXISTS (
    SELECT 1
    FROM public.user_entitlements ue
    WHERE ue.user_id = v_me
      AND ue.plan_code = 'plus'
      AND (ue.expires_at IS NULL OR ue.expires_at > v_now)
  ) INTO v_is_plus;

  -- Apply Plus defaults (does not wipe purchased balances)
  IF v_is_plus THEN
    -- Unlimited rewinds under Plus
    UPDATE public.user_consumables
      SET unlimited = true,
          included_total = 0,
          included_remaining = 0,
          renews_at = NULL,
          renewal_period_days = NULL,
          renewal_period_months = NULL,
          balance = GREATEST(purchased_balance + included_remaining, 0),
          updated_at = now()
      WHERE user_id = v_me AND consumable_type = 'rewind';

    -- Weekly included allowances (Hinge-style)
    UPDATE public.user_consumables
      SET unlimited = false,
          included_total = 2,
          included_remaining = CASE WHEN included_total = 0 AND included_remaining = 0 THEN 2 ELSE included_remaining END,
          renews_at = COALESCE(renews_at, now() + interval '7 days'),
          renewal_period_days = 7,
          renewal_period_months = NULL,
          updated_at = now()
      WHERE user_id = v_me AND consumable_type = 'boost';

    UPDATE public.user_consumables
      SET unlimited = false,
          included_total = 5,
          included_remaining = CASE WHEN included_total = 0 AND included_remaining = 0 THEN 5 ELSE included_remaining END,
          renews_at = COALESCE(renews_at, now() + interval '7 days'),
          renewal_period_days = 7,
          renewal_period_months = NULL,
          updated_at = now()
      WHERE user_id = v_me AND consumable_type = 'compliment';

    -- Monthly included allowance
    UPDATE public.user_consumables
      SET unlimited = false,
          included_total = 1,
          included_remaining = CASE WHEN included_total = 0 AND included_remaining = 0 THEN 1 ELSE included_remaining END,
          renews_at = COALESCE(renews_at, now() + interval '1 month'),
          renewal_period_days = NULL,
          renewal_period_months = 1,
          updated_at = now()
      WHERE user_id = v_me AND consumable_type = 'reset_dislikes';
  ELSE
    -- Not Plus: stop any subscription-based renewals and clear unlimited flags.
    -- Purchased balances remain (packs), but included allowances do not apply.
    UPDATE public.user_consumables
      SET unlimited = false,
          included_total = 0,
          included_remaining = 0,
          renews_at = NULL,
          renewal_period_days = NULL,
          renewal_period_months = NULL,
          balance = GREATEST(purchased_balance, 0),
          updated_at = now()
      WHERE user_id = v_me;
  END IF;

  -- Renewal processing: reset included_remaining when renews_at passes.
  FOR v_row IN
    SELECT * FROM public.user_consumables
    WHERE user_id = v_me
    FOR UPDATE
  LOOP
    IF v_row.unlimited = true THEN
      UPDATE public.user_consumables
        SET balance = GREATEST(v_row.purchased_balance + v_row.included_remaining, 0),
            updated_at = now()
        WHERE user_id = v_me AND consumable_type = v_row.consumable_type;
      CONTINUE;
    END IF;

    IF v_row.renews_at IS NULL THEN
      UPDATE public.user_consumables
        SET balance = GREATEST(v_row.purchased_balance + v_row.included_remaining, 0),
            updated_at = now()
        WHERE user_id = v_me AND consumable_type = v_row.consumable_type;
      CONTINUE;
    END IF;

    IF v_row.renews_at <= v_now AND v_row.included_total > 0 THEN
      IF v_row.renewal_period_days IS NOT NULL THEN
        WHILE v_row.renews_at <= v_now LOOP
          v_row.renews_at := v_row.renews_at + (v_row.renewal_period_days || ' days')::interval;
        END LOOP;
      ELSIF v_row.renewal_period_months IS NOT NULL THEN
        WHILE v_row.renews_at <= v_now LOOP
          v_row.renews_at := v_row.renews_at + (v_row.renewal_period_months || ' months')::interval;
        END LOOP;
      END IF;

      UPDATE public.user_consumables
        SET included_remaining = v_row.included_total,
            renews_at = v_row.renews_at,
            balance = GREATEST(v_row.purchased_balance + v_row.included_total, 0),
            updated_at = now()
        WHERE user_id = v_me AND consumable_type = v_row.consumable_type;
    ELSE
      UPDATE public.user_consumables
        SET balance = GREATEST(v_row.purchased_balance + v_row.included_remaining, 0),
            updated_at = now()
        WHERE user_id = v_me AND consumable_type = v_row.consumable_type;
    END IF;
  END LOOP;
END;
$$;

ALTER FUNCTION public._sync_my_consumables_state() SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 5) Public RPCs (called by the app)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS TABLE(
  plan_code text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public._sync_my_subscription_state();

  RETURN QUERY
  SELECT ue.plan_code, ue.expires_at
  FROM public.user_entitlements ue
  WHERE ue.user_id = auth.uid();
END;
$$;

ALTER FUNCTION public.get_my_entitlements() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS TABLE(
  product_code text,
  status text,
  renews_every_months int,
  current_period_start timestamptz,
  current_period_end timestamptz,
  auto_renews boolean,
  cancel_at_period_end boolean,
  canceled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public._sync_my_subscription_state();

  RETURN QUERY
  SELECT
    s.product_code,
    s.status,
    s.renews_every_months,
    s.current_period_start,
    s.current_period_end,
    s.auto_renews,
    s.cancel_at_period_end,
    s.canceled_at
  FROM public.user_subscriptions s
  WHERE s.user_id = auth.uid();
END;
$$;

ALTER FUNCTION public.get_my_subscription() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_plus_subscription(p_months int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_now timestamptz := now();
  v_existing public.user_subscriptions%ROWTYPE;
  v_new_end timestamptz;
  v_product_code text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_months NOT IN (1,3,6) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_months');
  END IF;

  PERFORM public._sync_my_subscription_state();

  SELECT * INTO v_existing
  FROM public.user_subscriptions s
  WHERE s.user_id = v_me
  FOR UPDATE;

  v_product_code := 'plus_m' || p_months::text;

  IF FOUND AND v_existing.status = 'active' AND v_existing.current_period_end > v_now THEN
    -- If already active, extend from the current end.
    v_new_end := v_existing.current_period_end + (p_months || ' months')::interval;

    UPDATE public.user_subscriptions
      SET product_code = v_product_code,
          renews_every_months = p_months,
          current_period_end = v_new_end,
          auto_renews = true,
          cancel_at_period_end = false,
          canceled_at = NULL,
          updated_at = now()
      WHERE user_id = v_me;
  ELSE
    v_new_end := v_now + (p_months || ' months')::interval;

    INSERT INTO public.user_subscriptions(
      user_id, product_code, status, renews_every_months,
      current_period_start, current_period_end,
      auto_renews, cancel_at_period_end, canceled_at,
      created_at, updated_at
    )
    VALUES (
      v_me, v_product_code, 'active', p_months,
      v_now, v_new_end,
      true, false, NULL,
      now(), now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      product_code = EXCLUDED.product_code,
      status = 'active',
      renews_every_months = EXCLUDED.renews_every_months,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      auto_renews = true,
      cancel_at_period_end = false,
      canceled_at = NULL,
      updated_at = now();
  END IF;

  -- Sync entitlements + consumables
  PERFORM public._sync_my_subscription_state();
  PERFORM public._sync_my_consumables_state();

  RETURN jsonb_build_object('ok', true, 'product_code', v_product_code, 'expires_at', v_new_end);
END;
$$;

ALTER FUNCTION public.purchase_plus_subscription(int) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.purchase_plus_subscription(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_my_subscription()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  UPDATE public.user_subscriptions
    SET cancel_at_period_end = true,
        auto_renews = false,
        canceled_at = now(),
        updated_at = now()
    WHERE user_id = v_me
      AND status = 'active';

  PERFORM public._sync_my_subscription_state();

  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER FUNCTION public.cancel_my_subscription() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.cancel_my_subscription() TO authenticated;

-- Purchase consumables (stub success)
CREATE OR REPLACE FUNCTION public.purchase_consumable(p_type text, p_quantity int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_qty int := COALESCE(p_quantity, 0);
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_type NOT IN ('boost','rewind','compliment','reset_dislikes') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  IF v_qty <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  END IF;

  PERFORM public._sync_my_consumables_state();

  UPDATE public.user_consumables
    SET purchased_balance = purchased_balance + v_qty,
        balance = GREATEST(purchased_balance + v_qty + included_remaining, 0),
        updated_at = now()
    WHERE user_id = v_me AND consumable_type = p_type;

  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER FUNCTION public.purchase_consumable(text, int) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.purchase_consumable(text, int) TO authenticated;

-- Consume consumables (for usage tracking; used now for reset_dislikes, later for boosts/compliments/rewind)
CREATE OR REPLACE FUNCTION public.consume_my_consumable(p_type text, p_quantity int DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_qty int := COALESCE(p_quantity, 1);
  v_row public.user_consumables%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_type NOT IN ('boost','rewind','compliment','reset_dislikes') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_type');
  END IF;

  IF v_qty <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_quantity');
  END IF;

  PERFORM public._sync_my_consumables_state();

  SELECT * INTO v_row
  FROM public.user_consumables
  WHERE user_id = v_me AND consumable_type = p_type
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.unlimited = true THEN
    RETURN jsonb_build_object('ok', true, 'unlimited', true);
  END IF;

  -- Spend included first, then purchased.
  WHILE v_qty > 0 LOOP
    IF v_row.included_remaining > 0 THEN
      v_row.included_remaining := v_row.included_remaining - 1;
    ELSIF v_row.purchased_balance > 0 THEN
      v_row.purchased_balance := v_row.purchased_balance - 1;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
    END IF;
    v_qty := v_qty - 1;
  END LOOP;

  UPDATE public.user_consumables
    SET purchased_balance = v_row.purchased_balance,
        included_remaining = v_row.included_remaining,
        balance = GREATEST(v_row.purchased_balance + v_row.included_remaining, 0),
        updated_at = now()
    WHERE user_id = v_me AND consumable_type = p_type;

  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER FUNCTION public.consume_my_consumable(text, int) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.consume_my_consumable(text, int) TO authenticated;

-- Keep existing name used by the app (`get_my_consumables`) but upgrade internals.
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
  PERFORM public._sync_my_consumables_state();

  RETURN QUERY
  SELECT
    uc.consumable_type,
    CASE WHEN uc.unlimited THEN 999999 ELSE uc.balance END AS balance,
    uc.renews_at,
    uc.renewal_period_days
  FROM public.user_consumables uc
  WHERE uc.user_id = auth.uid()
  ORDER BY uc.consumable_type;
END;
$$;

ALTER FUNCTION public.get_my_consumables() SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_my_consumables() TO authenticated;

