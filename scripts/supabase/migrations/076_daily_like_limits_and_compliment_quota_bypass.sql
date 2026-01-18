-- ============================================================================
-- Migration: Daily like limits (free vs plus) + compliment-like does NOT burn quota
--
-- Goals:
-- - Ensure lane-based daily like usage is tracked consistently (pals/match).
-- - Define like limits for free vs plus plans.
-- - Ensure "compliment" (send_chat_request) does NOT count toward daily like usage.
--
-- Notes:
-- - Like quota burn is enforced in submit_swipe (accept only).
-- - send_chat_request uses a "compliment-like" helper that records the accept swipe
--   but does NOT increment daily_like_usage.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Ensure swipes are lane-aware (required by submit_swipe + chat flows)
-- ---------------------------------------------------------------------------

ALTER TABLE public.swipes
  ADD COLUMN IF NOT EXISTS lane text CHECK (lane IN ('pals','match'));

UPDATE public.swipes
  SET lane = 'match'
  WHERE lane IS NULL;

DO $$
BEGIN
  -- Drop the legacy unique constraint on (viewer_id, candidate_id) so we can store swipes per lane.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.swipes'::regclass
      AND contype = 'u'
      AND conname = 'swipes_viewer_id_candidate_id_key'
  ) THEN
    EXECUTE 'ALTER TABLE public.swipes DROP CONSTRAINT swipes_viewer_id_candidate_id_key';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS swipes_viewer_candidate_lane_uq
  ON public.swipes(viewer_id, candidate_id, lane);

-- ---------------------------------------------------------------------------
-- 1) Table: daily_like_usage (required by submit_swipe)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_like_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_utc date NOT NULL,
  lane text NOT NULL CHECK (lane IN ('pals','match')),
  likes_used int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_utc, lane)
);

CREATE INDEX IF NOT EXISTS idx_daily_like_usage_user_day_lane
  ON public.daily_like_usage(user_id, day_utc, lane);

ALTER TABLE public.daily_like_usage ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.daily_like_usage TO authenticated;

DROP POLICY IF EXISTS daily_like_usage_select_self ON public.daily_like_usage;
CREATE POLICY daily_like_usage_select_self
  ON public.daily_like_usage
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No client-side INSERT/UPDATE/DELETE (mutated via RPCs only).

-- ---------------------------------------------------------------------------
-- 2) ensure_user_entitlements(user_id) (required by submit_swipe)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_user_entitlements(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id';
  END IF;

  -- Keep existing values if present; ensure a row exists at minimum.
  INSERT INTO public.user_entitlements(user_id, plan_code, expires_at, updated_at)
  VALUES (p_user_id, 'free', NULL, now())
  ON CONFLICT (user_id) DO UPDATE
    SET plan_code = COALESCE(public.user_entitlements.plan_code, 'free'),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_entitlements(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) get_daily_like_limit(user_id, lane)
-- ---------------------------------------------------------------------------
-- Business rules (mirrors Plus perks table UI):
-- - Free:  Match = 7/day, Pals = 15/day
-- - Plus:  Match = 20/day, Pals = 40/day
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_daily_like_limit(p_user_id uuid, p_lane text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_plus boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user_id';
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RAISE EXCEPTION 'invalid_lane';
  END IF;

  PERFORM public.ensure_user_entitlements(p_user_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.user_entitlements ue
    WHERE ue.user_id = p_user_id
      AND ue.plan_code = 'plus'
      AND (ue.expires_at IS NULL OR ue.expires_at > now())
  )
  INTO v_is_plus;

  IF v_is_plus THEN
    RETURN CASE WHEN p_lane = 'match' THEN 20 ELSE 40 END;
  END IF;

  RETURN CASE WHEN p_lane = 'match' THEN 7 ELSE 15 END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_like_limit(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) submit_compliment_like(candidate_id, lane)
-- ---------------------------------------------------------------------------
-- Records an "accept" swipe WITHOUT consuming daily like quota.
-- Used by send_chat_request (compliment messages).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_compliment_like(
  p_candidate_id uuid,
  p_lane text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'utc')::date;
  v_limit int;
  v_used int;
BEGIN
  IF v_viewer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_candidate_id IS NULL OR p_candidate_id = v_viewer_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_candidate');
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lane');
  END IF;

  -- Ensure entitlements exist BEFORE reading limits
  PERFORM public.ensure_user_entitlements(v_viewer_id);

  -- Serialize per viewer (consistent with submit_swipe)
  PERFORM pg_advisory_xact_lock(hashtext(v_viewer_id::text));

  -- Upsert accept swipe WITHOUT touching daily_like_usage
  INSERT INTO public.swipes(viewer_id, candidate_id, lane, action, created_at)
  VALUES (v_viewer_id, p_candidate_id, p_lane, 'accept', now())
  ON CONFLICT (viewer_id, candidate_id, lane)
  DO UPDATE SET action = 'accept', created_at = now();

  -- Preserve cross-lane pending behavior for compliment-like accepts
  PERFORM public.create_cross_lane_pending_if_needed(v_viewer_id, p_candidate_id, p_lane);

  -- Return remaining accepts for UI (but do not consume one)
  v_limit := public.get_daily_like_limit(v_viewer_id, p_lane);
  SELECT COALESCE(likes_used, 0) INTO v_used
  FROM public.daily_like_usage
  WHERE user_id = v_viewer_id AND day_utc = v_day AND lane = p_lane;

  RETURN jsonb_build_object(
    'ok', true,
    'lane', p_lane,
    'remaining_accepts', GREATEST(v_limit - COALESCE(v_used, 0), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_compliment_like(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Update send_chat_request to use submit_compliment_like (no quota burn)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_chat_request(
  p_target_id uuid,
  p_lane text,
  p_body text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_client_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_convo_id uuid;
  v_like jsonb;
  v_consume jsonb;
  v_low uuid;
  v_high uuid;
  v_is_mutual_like boolean := false;
  v_conversation_status text;
  v_pending_written int := 0;
  v_inserted int := 0;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_target_id IS NULL OR p_target_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lane');
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_message');
  END IF;

  IF p_client_message_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_client_message_id');
  END IF;

  -- Check if there's already a mutual like (target has accepted v_me in the same lane)
  SELECT EXISTS (
    SELECT 1
    FROM public.swipes s
    WHERE s.viewer_id = p_target_id
      AND s.candidate_id = v_me
      AND s.lane = p_lane
      AND s.action = 'accept'
  ) INTO v_is_mutual_like;

  -- Compliment-like does NOT consume daily like quota.
  v_like := public.submit_compliment_like(p_target_id, p_lane);
  IF COALESCE((v_like->>'ok')::boolean, false) = false THEN
    RETURN v_like;
  END IF;

  v_low  := LEAST(v_me, p_target_id);
  v_high := GREATEST(v_me, p_target_id);

  -- Cross-lane pending: do not create a conversation yet, but persist the message.
  IF EXISTS (
    SELECT 1
    FROM public.cross_lane_connections c
    WHERE c.user_low = v_low
      AND c.user_high = v_high
      AND c.status = 'pending'
  ) THEN
    -- Write the first message exactly once.
    UPDATE public.cross_lane_connections c
    SET
      message_body = p_body,
      message_metadata = COALESCE(p_metadata,'{}'::jsonb),
      message_sender_id = v_me,
      message_created_at = now(),
      message_client_message_id = COALESCE(c.message_client_message_id, p_client_message_id),
      message_lane = COALESCE(c.message_lane, p_lane)
    WHERE c.user_low = v_low
      AND c.user_high = v_high
      AND c.status = 'pending'
      AND c.message_body IS NULL;

    GET DIAGNOSTICS v_pending_written = ROW_COUNT;

    -- Consume 1 compliment ONLY if we actually wrote the message (idempotent on retry).
    IF v_pending_written > 0 THEN
      v_consume := public.consume_my_consumable('compliment', 1);
      IF COALESCE((v_consume->>'ok')::boolean, false) = false THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_compliments';
      END IF;
    END IF;

    -- If message exists but client id wasn't saved (legacy), set it.
    UPDATE public.cross_lane_connections c
    SET message_client_message_id = COALESCE(c.message_client_message_id, p_client_message_id)
    WHERE c.user_low = v_low
      AND c.user_high = v_high
      AND c.status = 'pending'
      AND c.message_body IS NOT NULL
      AND c.message_client_message_id IS NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'cross_lane_pending', true,
      'remaining_accepts', v_like->'remaining_accepts'
    );
  END IF;

  -- Determine conversation status:
  -- - If mutual like exists (target already liked v_me), status = 'active'
  -- - Otherwise, status = 'request'
  v_conversation_status := CASE
    WHEN v_is_mutual_like THEN 'active'
    ELSE 'request'
  END;

  -- Upsert conversation using explicit constraint
  INSERT INTO public.conversations(user_low, user_high, lane, status, requested_by, created_at, updated_at)
  VALUES (v_low, v_high, p_lane, v_conversation_status, v_me, now(), now())
  ON CONFLICT (user_low, user_high)
  DO UPDATE SET
    status = CASE
      WHEN public.conversations.status = 'active' THEN public.conversations.status
      WHEN v_is_mutual_like THEN 'active'
      ELSE COALESCE(public.conversations.status, 'request')
    END,
    lane = CASE
      WHEN public.conversations.status = 'active' THEN public.conversations.lane
      ELSE EXCLUDED.lane
    END,
    requested_by = CASE
      WHEN public.conversations.status = 'request'
        THEN COALESCE(public.conversations.requested_by, EXCLUDED.requested_by)
      WHEN public.conversations.status = 'active'
        THEN public.conversations.requested_by
      ELSE EXCLUDED.requested_by
    END,
    updated_at = now()
  RETURNING id INTO v_convo_id;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, v_me)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, p_target_id)
  ON CONFLICT DO NOTHING;

  WITH ins AS (
    INSERT INTO public.conversation_messages(conversation_id, sender_id, kind, body, metadata, client_message_id)
    VALUES (v_convo_id, v_me, 'compliment', p_body, COALESCE(p_metadata,'{}'::jsonb), p_client_message_id)
    ON CONFLICT ON CONSTRAINT conversation_messages_client_message_id_key DO NOTHING
    RETURNING sender_id, kind, body, created_at
  ),
  upd AS (
    UPDATE public.conversations c
    SET last_message_at = ins.created_at,
        last_sender_id = ins.sender_id,
        last_message_kind = ins.kind,
        last_message_text = ins.body,
        last_message_preview = left(ins.body, 140),
        updated_at = now()
    FROM ins
    WHERE c.id = v_convo_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  -- Consume 1 compliment only if we inserted a new message (idempotent on retry).
  IF v_inserted > 0 THEN
    v_consume := public.consume_my_consumable('compliment', 1);
    IF COALESCE((v_consume->>'ok')::boolean, false) = false THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient_compliments';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_convo_id,
    'remaining_accepts', v_like->'remaining_accepts'
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM = 'insufficient_compliments' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_compliments');
    END IF;
    RAISE;
END;
$$;

