-- send_chat_request: guard against creating a conversation/message when a cross-lane
-- pending connection exists for the pair.
--
-- Cross-lane pending is created inside submit_swipe when mutual interest exists
-- across different lanes. Until resolved (or auto-resolved), we must NOT create
-- a conversation thread.

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
  v_low uuid;
  v_high uuid;
  v_is_mutual_like boolean := false;
  v_conversation_status text;
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

  -- Like = counts toward like limit (per your rule)
  v_like := public.submit_swipe(p_target_id, 'accept', p_lane);
  IF COALESCE((v_like->>'ok')::boolean, false) = false THEN
    RETURN v_like;
  END IF;

  v_low  := LEAST(v_me, p_target_id);
  v_high := GREATEST(v_me, p_target_id);

  -- Cross-lane mutual formed in a different lane: submit_swipe will have created a
  -- pending cross_lane_connections row. Do not create a conversation/message here.
  IF EXISTS (
    SELECT 1
    FROM public.cross_lane_connections c
    WHERE c.user_low = v_low
      AND c.user_high = v_high
      AND c.status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cross_lane_pending');
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
      WHEN v_is_mutual_like THEN 'active'  -- Upgrade to active if mutual like
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

  -- Participants (requires PK/unique on (conversation_id, user_id))
  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, v_me)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, p_target_id)
  ON CONFLICT DO NOTHING;

  -- Insert message idempotently; only update conversation last_message_* if insert succeeded
  WITH ins AS (
    INSERT INTO public.conversation_messages(conversation_id, sender_id, kind, body, metadata, client_message_id)
    VALUES (v_convo_id, v_me, 'compliment', p_body, COALESCE(p_metadata,'{}'::jsonb), p_client_message_id)
    ON CONFLICT ON CONSTRAINT conversation_messages_client_message_id_key DO NOTHING
    RETURNING sender_id, kind, body, created_at
  )
  UPDATE public.conversations c
  SET last_message_at = ins.created_at,
      last_sender_id = ins.sender_id,
      last_message_kind = ins.kind,
      last_message_text = ins.body,
      last_message_preview = left(ins.body, 140),
      updated_at = now()
  FROM ins
  WHERE c.id = v_convo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_convo_id,
    'remaining_accepts', v_like->'remaining_accepts'
  );
END;
$$;
