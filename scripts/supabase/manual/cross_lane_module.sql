-- Cross-lane connections module (manual apply)
-- Notes:
-- - "Chooser" is ALWAYS the Pals-liker.
-- - Pending cross-lane tiles are visible ONLY to chooser (via get_cross_lane_pending).
-- - Once resolved (or auto-resolved), the connection becomes visible on BOTH sides via get_messages_home.
--
-- IMPORTANT: Review in your environment before applying.

BEGIN;

-- 1) Table
CREATE TABLE IF NOT EXISTS public.cross_lane_connections (
  user_low uuid NOT NULL,
  user_high uuid NOT NULL,
  chooser_id uuid NOT NULL, -- pals-liker (the one who must choose)
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  chosen_lane text NULL CHECK (chosen_lane IN ('pals','match')),
  resolved_at timestamptz NULL,
  resolved_by text NULL CHECK (resolved_by IN ('chooser','auto')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cross_lane_connections_pkey PRIMARY KEY (user_low, user_high),
  CONSTRAINT cross_lane_connections_user_pair_check CHECK (user_low < user_high)
);

CREATE INDEX IF NOT EXISTS cross_lane_connections_chooser_pending_idx
  ON public.cross_lane_connections (chooser_id, expires_at)
  WHERE resolved_at IS NULL;

-- 2) Updated_at trigger (optional; safe if you already have a generic trigger function)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    -- Assume you have public.set_updated_at() trigger function
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cross_lane_connections_updated_at'
    ) THEN
      CREATE TRIGGER trg_cross_lane_connections_updated_at
      BEFORE UPDATE ON public.cross_lane_connections
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- 3) Helper: create pending cross-lane record when mutual across lanes occurs
CREATE OR REPLACE FUNCTION public.maybe_create_cross_lane_pending(
  p_viewer_id uuid,
  p_candidate_id uuid,
  p_lane text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other_lane text;
  v_low uuid;
  v_high uuid;
  v_chooser uuid;
BEGIN
  IF p_viewer_id IS NULL OR p_candidate_id IS NULL OR p_viewer_id = p_candidate_id THEN
    RETURN;
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RETURN;
  END IF;

  v_other_lane := CASE WHEN p_lane = 'pals' THEN 'match' ELSE 'pals' END;

  -- Cross-lane mutual means: viewer accepted candidate in p_lane, and candidate accepted viewer in the OTHER lane.
  IF EXISTS (
    SELECT 1
    FROM public.swipes s
    WHERE s.viewer_id = p_candidate_id
      AND s.candidate_id = p_viewer_id
      AND s.lane = v_other_lane
      AND s.action = 'accept'
  ) THEN
    v_low  := LEAST(p_viewer_id, p_candidate_id);
    v_high := GREATEST(p_viewer_id, p_candidate_id);

    -- Chooser is ALWAYS the pals-liker.
    v_chooser := CASE
      WHEN p_lane = 'pals' THEN p_viewer_id      -- viewer is pals-liker
      ELSE p_candidate_id                        -- candidate is pals-liker
    END;

    INSERT INTO public.cross_lane_connections (user_low, user_high, chooser_id, created_at, expires_at, updated_at)
    VALUES (v_low, v_high, v_chooser, now(), now() + interval '72 hours', now())
    ON CONFLICT (user_low, user_high) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.maybe_create_cross_lane_pending(uuid, uuid, text) TO authenticated;

-- 4) RPC: chooser-only list for Liked You screen (top Matches row)
CREATE OR REPLACE FUNCTION public.get_cross_lane_pending(p_limit int DEFAULT 20)
RETURNS TABLE (
  other_id uuid,
  pending_at timestamptz,
  expires_at timestamptz,
  display_name text,
  dog_name text,
  hero_storage_path text
)
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

  RETURN QUERY
  WITH
  pending AS (
    SELECT
      CASE WHEN c.user_low = v_me THEN c.user_high ELSE c.user_low END AS other_id,
      c.created_at AS pending_at,
      c.expires_at
    FROM public.cross_lane_connections c
    WHERE c.chooser_id = v_me
      AND c.resolved_at IS NULL
    ORDER BY c.created_at DESC
    LIMIT p_limit
  ),
  best_dog AS (
    SELECT d.user_id,
           MIN(d.slot) AS best_slot,
           (array_agg(d.name ORDER BY d.slot))[1] AS dog_name
    FROM public.dogs d
    WHERE d.is_active = true
    GROUP BY d.user_id
  )
  SELECT
    p.other_id,
    p.pending_at,
    p.expires_at,
    pr.display_name,
    COALESCE(bd.dog_name, '') AS dog_name,
    hp.storage_path AS hero_storage_path
  FROM pending p
  JOIN public.profiles pr ON pr.user_id = p.other_id
  LEFT JOIN best_dog bd ON bd.user_id = p.other_id
  LEFT JOIN LATERAL public.pick_hero_photo(p.other_id, v_me, bd.best_slot) hp ON TRUE
  WHERE pr.lifecycle_status IN ('active', 'limited')
    AND COALESCE(pr.is_hidden, false) = false
    AND pr.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cross_lane_pending(int) TO authenticated;

-- 5) RPC: chooser resolves Pals vs Match
CREATE OR REPLACE FUNCTION public.resolve_cross_lane(
  p_target_id uuid,
  p_choice_lane text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_row public.cross_lane_connections%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_target_id IS NULL OR p_target_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  IF p_choice_lane NOT IN ('pals','match') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_choice_lane');
  END IF;

  v_low  := LEAST(v_me, p_target_id);
  v_high := GREATEST(v_me, p_target_id);

  SELECT *
    INTO v_row
  FROM public.cross_lane_connections c
  WHERE c.user_low = v_low AND c.user_high = v_high
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'chosen_lane', v_row.chosen_lane, 'already_resolved', true);
  END IF;

  IF v_row.chooser_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_chooser');
  END IF;

  UPDATE public.cross_lane_connections
  SET chosen_lane = p_choice_lane,
      resolved_at = now(),
      resolved_by = 'chooser',
      updated_at = now()
  WHERE user_low = v_low AND user_high = v_high;

  RETURN jsonb_build_object('ok', true, 'chosen_lane', p_choice_lane);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_cross_lane(uuid, text) TO authenticated;

-- 6) Job: auto-resolve any expired pending to Pals
CREATE OR REPLACE FUNCTION public.auto_resolve_cross_lane_expired()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.cross_lane_connections
  SET chosen_lane = 'pals',
      resolved_at = now(),
      resolved_by = 'auto',
      updated_at = now()
  WHERE resolved_at IS NULL
    AND expires_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_resolve_cross_lane_expired() TO authenticated;

COMMIT;

-- Scheduling (choose one):
-- A) Supabase Scheduled Triggers UI: run "select public.auto_resolve_cross_lane_expired();" every 15 minutes.
-- B) If pg_cron is available:
--    select cron.schedule('auto-resolve-cross-lane', '*/15 * * * *', $$select public.auto_resolve_cross_lane_expired();$$);

-- REQUIRED: Update submit_swipe to call maybe_create_cross_lane_pending(auth.uid(), p_candidate_id, p_lane)
--           only when p_action='accept' (after the upsert succeeds).
--
-- REQUIRED: Update get_messages_home to include resolved rows from cross_lane_connections as Matches on both sides.
