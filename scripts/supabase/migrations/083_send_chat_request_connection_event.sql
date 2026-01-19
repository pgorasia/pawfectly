-- ============================================================================
-- Migration: send_chat_request returns connection event for feed UX
--
-- Goal:
-- - Allow the feed to show "It's a Match/Wag" (same-lane mutual) and the
--   cross-lane chooser prompt (Pals-liker only) without additional queries.
-- - Preserve existing behavior and response keys.
-- ============================================================================

-- This function is last defined in 076_daily_like_limits_and_compliment_quota_bypass.sql.
-- We re-define it here and only add new JSON keys in the returned objects.

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
      'remaining_accepts', v_like->'remaining_accepts',
      -- New: allow feed to prompt chooser immediately (pals-liker only)
      'connection_event',
        CASE
          WHEN p_lane = 'pals' THEN jsonb_build_object(
            'type', 'cross_lane_chooser',
            'other_user_id', p_target_id
          )
          ELSE NULL
        END
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
    'remaining_accepts', v_like->'remaining_accepts',
    -- New: signal if this action completed a same-lane mutual connection
    'connection_event',
      CASE
        WHEN v_is_mutual_like THEN jsonb_build_object(
          'type', 'mutual',
          'lane', p_lane,
          'other_user_id', p_target_id
        )
        ELSE NULL
      END
  );
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM = 'insufficient_compliments' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_compliments');
    END IF;
    RAISE;
END;
$$;

