-- Cross-lane pending connections (pals-liker chooses lane)
-- This module persists the "pending cross-lane" state in the DB (not derived ad-hoc from swipes),
-- enabling clean idempotency and straightforward 72h auto-resolution.

-- ---------------------------------------------------------------------
-- A) Table: public.cross_lane_connections
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cross_lane_connections (
  user_low uuid NOT NULL,
  user_high uuid NOT NULL,

  pals_user_id uuid NOT NULL,
  match_user_id uuid NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,

  resolved_at timestamptz NULL,
  resolved_lane text NULL CHECK (resolved_lane IN ('pals','match')),
  resolved_by uuid NULL, -- pals user or NULL for system

  status text NOT NULL CHECK (status IN ('pending','resolved')),

  CONSTRAINT cross_lane_connections_pkey PRIMARY KEY (user_low, user_high),
  CONSTRAINT cross_lane_connections_distinct_users_check CHECK (pals_user_id <> match_user_id),
  CONSTRAINT cross_lane_connections_pair_check
    CHECK (user_low = LEAST(pals_user_id, match_user_id) AND user_high = GREATEST(pals_user_id, match_user_id))
);

CREATE INDEX IF NOT EXISTS cross_lane_connections_pending_expires_idx
  ON public.cross_lane_connections (expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS cross_lane_connections_pending_pals_idx
  ON public.cross_lane_connections (pals_user_id, expires_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS cross_lane_connections_pending_match_idx
  ON public.cross_lane_connections (match_user_id, expires_at)
  WHERE status = 'pending';

ALTER TABLE public.cross_lane_connections ENABLE ROW LEVEL SECURITY;

-- Participants can read their own pending/resolved row (useful for debugging/admin views).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cross_lane_connections'
      AND policyname = 'cross_lane_connections_select_participants'
  ) THEN
    CREATE POLICY cross_lane_connections_select_participants
      ON public.cross_lane_connections
      FOR SELECT
      TO authenticated
      USING (auth.uid() = pals_user_id OR auth.uid() = match_user_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- B) Helper: create pending record when a cross-lane mutual is formed
-- ---------------------------------------------------------------------
-- Called from submit_swipe (and can be reused elsewhere).
-- Inserts a pending row only when:
--  - reverse accept exists in the OTHER lane
--  - reverse accept does NOT exist in the SAME lane (i.e., not same-lane mutual)
-- Idempotent: ON CONFLICT DO NOTHING.

CREATE OR REPLACE FUNCTION public.create_cross_lane_pending_if_needed(
  p_viewer_id uuid,
  p_candidate_id uuid,
  p_lane text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_low uuid := LEAST(p_viewer_id, p_candidate_id);
  v_high uuid := GREATEST(p_viewer_id, p_candidate_id);
  v_other_lane text := CASE WHEN p_lane = 'pals' THEN 'match' ELSE 'pals' END;
  v_reverse_other boolean;
  v_reverse_same boolean;
  v_pals uuid;
  v_match uuid;
BEGIN
  IF p_viewer_id IS NULL OR p_candidate_id IS NULL OR p_viewer_id = p_candidate_id THEN
    RETURN false;
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RETURN false;
  END IF;

  -- Reverse accept in other lane?
  SELECT EXISTS (
    SELECT 1
    FROM public.swipes s
    WHERE s.viewer_id = p_candidate_id
      AND s.candidate_id = p_viewer_id
      AND s.lane = v_other_lane
      AND s.action = 'accept'
  ) INTO v_reverse_other;

  IF NOT v_reverse_other THEN
    RETURN false;
  END IF;

  -- If already mutual in the same lane, do not create pending.
  SELECT EXISTS (
    SELECT 1
    FROM public.swipes s
    WHERE s.viewer_id = p_candidate_id
      AND s.candidate_id = p_viewer_id
      AND s.lane = p_lane
      AND s.action = 'accept'
  ) INTO v_reverse_same;

  IF v_reverse_same THEN
    RETURN false;
  END IF;

  IF p_lane = 'pals' THEN
    v_pals := p_viewer_id;
    v_match := p_candidate_id;
  ELSE
    v_pals := p_candidate_id;
    v_match := p_viewer_id;
  END IF;

  INSERT INTO public.cross_lane_connections (
    user_low, user_high,
    pals_user_id, match_user_id,
    created_at, expires_at,
    status
  )
  VALUES (
    v_low, v_high,
    v_pals, v_match,
    now(), now() + interval '72 hours',
    'pending'
  )
  ON CONFLICT (user_low, user_high) DO NOTHING;

  RETURN EXISTS (
    SELECT 1
    FROM public.cross_lane_connections c
    WHERE c.user_low = v_low
      AND c.user_high = v_high
      AND c.status = 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cross_lane_pending_if_needed(uuid, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- D) RPC: resolve_cross_lane_connection(p_other_id, p_selected_lane)
-- ---------------------------------------------------------------------
-- Chooser-only (pals_user_id) resolves pending row.
-- Ensures lane consistency by inserting the missing "accept" swipe in the resolved lane (no quota),
-- then creates/upserts an ACTIVE conversation in that lane.

CREATE OR REPLACE FUNCTION public.resolve_cross_lane_connection(
  p_other_id uuid,
  p_selected_lane text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_row public.cross_lane_connections%rowtype;
  v_convo_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_other_id IS NULL OR p_other_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  IF p_selected_lane NOT IN ('pals','match') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lane');
  END IF;

  v_low := LEAST(v_me, p_other_id);
  v_high := GREATEST(v_me, p_other_id);

  SELECT * INTO v_row
  FROM public.cross_lane_connections c
  WHERE c.user_low = v_low
    AND c.user_high = v_high
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status <> 'pending' OR v_row.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_resolved', 'lane', v_row.resolved_lane);
  END IF;

  IF v_me <> v_row.pals_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.cross_lane_connections
  SET status = 'resolved',
      resolved_lane = p_selected_lane,
      resolved_at = now(),
      resolved_by = v_me
  WHERE user_low = v_low
    AND user_high = v_high;

  -- Ensure both accepts exist in the resolved lane (NO quota burn).
  IF p_selected_lane = 'match' THEN
    INSERT INTO public.swipes(viewer_id, candidate_id, lane, action, created_at)
    VALUES (v_row.pals_user_id, v_row.match_user_id, 'match', 'accept', now())
    ON CONFLICT (viewer_id, candidate_id, lane)
    DO UPDATE SET action = 'accept', created_at = now();
  ELSE
    INSERT INTO public.swipes(viewer_id, candidate_id, lane, action, created_at)
    VALUES (v_row.match_user_id, v_row.pals_user_id, 'pals', 'accept', now())
    ON CONFLICT (viewer_id, candidate_id, lane)
    DO UPDATE SET action = 'accept', created_at = now();
  END IF;

  -- Create/upgrade conversation to ACTIVE in the resolved lane.
  INSERT INTO public.conversations(user_low, user_high, lane, status, requested_by, created_at, updated_at)
  VALUES (v_low, v_high, p_selected_lane, 'active', NULL, now(), now())
  ON CONFLICT (user_low, user_high)
  DO UPDATE SET
    status = 'active',
    requested_by = NULL,
    lane = EXCLUDED.lane,
    updated_at = now()
  RETURNING id INTO v_convo_id;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, v_row.pals_user_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, v_row.match_user_id)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_convo_id,
    'lane', p_selected_lane
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_cross_lane_connection(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- E) Auto-resolve after 72 hours (system resolves to Pals)
-- ---------------------------------------------------------------------
-- Intended to be called by a scheduled job (Supabase Scheduled Edge Function recommended).
-- Resolves up to p_limit rows per invocation; uses SKIP LOCKED for safe concurrency.

CREATE OR REPLACE FUNCTION public.auto_resolve_cross_lane_connections(p_limit int DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_row public.cross_lane_connections%rowtype;
  v_convo_id uuid;
BEGIN
  FOR v_row IN
    SELECT *
    FROM public.cross_lane_connections c
    WHERE c.status = 'pending'
      AND c.expires_at <= now()
    ORDER BY c.expires_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.cross_lane_connections
    SET status = 'resolved',
        resolved_lane = 'pals',
        resolved_at = now(),
        resolved_by = NULL
    WHERE user_low = v_row.user_low
      AND user_high = v_row.user_high
      AND status = 'pending';

    -- Ensure both accepts exist in Pals lane (NO quota burn).
    INSERT INTO public.swipes(viewer_id, candidate_id, lane, action, created_at)
    VALUES (v_row.match_user_id, v_row.pals_user_id, 'pals', 'accept', now())
    ON CONFLICT (viewer_id, candidate_id, lane)
    DO UPDATE SET action = 'accept', created_at = now();

    -- Create/upgrade conversation to ACTIVE in pals lane.
    INSERT INTO public.conversations(user_low, user_high, lane, status, requested_by, created_at, updated_at)
    VALUES (v_row.user_low, v_row.user_high, 'pals', 'active', NULL, now(), now())
    ON CONFLICT (user_low, user_high)
    DO UPDATE SET
      status = 'active',
      requested_by = NULL,
      lane = 'pals',
      updated_at = now()
    RETURNING id INTO v_convo_id;

    INSERT INTO public.conversation_participants(conversation_id, user_id)
    VALUES (v_convo_id, v_row.pals_user_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.conversation_participants(conversation_id, user_id)
    VALUES (v_convo_id, v_row.match_user_id)
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'resolved', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_resolve_cross_lane_connections(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_resolve_cross_lane_connections(int) TO service_role;
