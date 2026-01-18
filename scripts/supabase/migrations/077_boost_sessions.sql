-- ============================================================================
-- Migration: Boost sessions (server-timed, no client authority)
--
-- Goal:
-- - Track "Boost active for 60 minutes" with authoritative server timestamps.
-- - Decrement 1 boost only when a boost session is successfully started.
-- - Allow purchase of extra boosts separately (handled via purchase_consumable).
--
-- Design:
-- - public.user_boost_sessions: append-only-ish records (status flips to ended).
-- - public.get_my_boost_status(): returns current active boost (if any).
-- - public.start_my_boost(): consumes 1 boost, creates session, returns ends_at.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_boost_sessions (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_boost_sessions_user_active
  ON public.user_boost_sessions(user_id, ends_at)
  WHERE status = 'active';

ALTER TABLE public.user_boost_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.user_boost_sessions TO authenticated;

DROP POLICY IF EXISTS user_boost_sessions_select_self ON public.user_boost_sessions;
CREATE POLICY user_boost_sessions_select_self
  ON public.user_boost_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No client-side INSERT/UPDATE/DELETE (mutated via RPCs).

CREATE OR REPLACE FUNCTION public._end_expired_my_boosts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.user_boost_sessions
    SET status = 'ended',
        updated_at = now()
    WHERE user_id = v_me
      AND status = 'active'
      AND ends_at <= now();
END;
$$;

ALTER FUNCTION public._end_expired_my_boosts() SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_my_boost_status()
RETURNS TABLE(
  is_active boolean,
  started_at timestamptz,
  ends_at timestamptz,
  remaining_seconds int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  PERFORM public._end_expired_my_boosts();

  RETURN QUERY
  SELECT
    true as is_active,
    s.started_at,
    s.ends_at,
    GREATEST(0, floor(extract(epoch from (s.ends_at - v_now)))::int) as remaining_seconds
  FROM public.user_boost_sessions s
  WHERE s.user_id = auth.uid()
    AND s.status = 'active'
    AND s.ends_at > v_now
  ORDER BY s.started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::timestamptz, NULL::timestamptz, 0;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_boost_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.start_my_boost()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_now timestamptz := now();
  v_ends_at timestamptz := v_now + interval '60 minutes';
  v_existing public.user_boost_sessions%ROWTYPE;
  v_consume jsonb;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Serialize start to prevent double-spend on retry/tap.
  PERFORM pg_advisory_xact_lock(hashtext(v_me::text || ':boost'));

  -- Ensure any expired sessions are ended first.
  UPDATE public.user_boost_sessions
    SET status = 'ended',
        updated_at = now()
    WHERE user_id = v_me
      AND status = 'active'
      AND ends_at <= v_now;

  SELECT * INTO v_existing
  FROM public.user_boost_sessions s
  WHERE s.user_id = v_me
    AND s.status = 'active'
    AND s.ends_at > v_now
  ORDER BY s.started_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'already_active',
      'ends_at', v_existing.ends_at
    );
  END IF;

  -- Consume one boost (included first, then purchased). This is the single source of truth.
  v_consume := public.consume_my_consumable('boost', 1);
  IF COALESCE((v_consume->>'ok')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', COALESCE(v_consume->>'error','insufficient_boosts'));
  END IF;

  INSERT INTO public.user_boost_sessions(user_id, started_at, ends_at, status, created_at, updated_at)
  VALUES (v_me, v_now, v_ends_at, 'active', now(), now());

  RETURN jsonb_build_object('ok', true, 'started_at', v_now, 'ends_at', v_ends_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_my_boost() TO authenticated;

