-- ============================================================================
-- Migration: Paid "last message" read receipt (WhatsApp-style)
--
-- Goal:
-- - Keep DB writes minimal (conditional updates only)
-- - Return a small "read_receipt" payload from get_conversation_messages
-- - Gate receipt details server-side to Plus tier (one-sided premium)
--
-- Notes:
-- - Chat is 1:1, so "other participant" is user_id <> auth.uid()
-- - We use last_read_at / last_delivered_at timestamps for "Seen/Delivered" of ONLY the latest message.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) RPC: mark_conversation_read(p_conversation_id uuid)
--    Conditional write:
--    - Only updates if there is a newer last_message_at from the OTHER user.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_updated int := 0;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'not_authenticated');
  END IF;

  -- Only participants (and not removed) can mark read.
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_me
      AND cp.removed_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'success', false, 'error', 'not_participant');
  END IF;

  UPDATE public.conversation_participants cp
  SET last_read_at = now()
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND cp.conversation_id = p_conversation_id
    AND cp.user_id = v_me
    AND cp.removed_at IS NULL
    AND c.last_message_at IS NOT NULL
    AND c.last_sender_id IS DISTINCT FROM v_me
    AND (cp.last_read_at IS NULL OR cp.last_read_at < c.last_message_at);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'success', true, 'updated', v_updated);
END;
$$;

ALTER FUNCTION public.mark_conversation_read(uuid) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 2) RPC: get_conversation_messages(...)
--    - Still returns { messages: [...] }
--    - Adds paid-gated { read_receipt: {...} } for Plus users
--    - Reduces write load by making delivered/read updates conditional
-- ---------------------------------------------------------------------------

-- Drop likely older overloads to avoid ambiguity with Supabase RPC resolution.
DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, timestamptz, bigint, int);
DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, timestamptz, uuid, int);
DROP FUNCTION IF EXISTS public.get_conversation_messages(uuid, timestamptz, text, int);

CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_conversation_id uuid,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id bigint DEFAULT NULL,
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_out jsonb;
  v_is_plus boolean := false;

  v_last_message_at timestamptz;
  v_last_sender_id uuid;

  v_other_last_delivered_at timestamptz;
  v_other_last_read_at timestamptz;

  v_delivered boolean := false;
  v_seen boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id = v_me
      AND cp.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  SELECT c.last_message_at, c.last_sender_id
  INTO v_last_message_at, v_last_sender_id
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  -- Delivered: caller has fetched the thread (but only write if it moves forward).
  UPDATE public.conversation_participants cp
  SET last_delivered_at = now()
  WHERE cp.conversation_id = p_conversation_id
    AND cp.user_id = v_me
    AND cp.removed_at IS NULL
    AND v_last_message_at IS NOT NULL
    AND (cp.last_delivered_at IS NULL OR cp.last_delivered_at < v_last_message_at);

  WITH msgs AS (
    SELECT
      id, sender_id, kind, body, metadata, created_at
    FROM public.conversation_messages
    WHERE conversation_id = p_conversation_id
      AND (
        p_before_created_at IS NULL
        OR created_at < p_before_created_at
        OR (created_at = p_before_created_at AND (p_before_id IS NULL OR id < p_before_id))
      )
    ORDER BY created_at DESC, id DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'messages', COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'sender_id', sender_id,
      'kind', kind,
      'body', body,
      'metadata', metadata,
      'created_at', created_at
    ) ORDER BY created_at ASC, id ASC), '[]'::jsonb)
  )
  INTO v_out
  FROM msgs;

  -- Paid gating: only Plus users receive read receipt details.
  -- Lazy-create entitlement row if missing (no-op if it already exists).
  INSERT INTO public.user_entitlements(user_id)
  VALUES (v_me)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT (ue.tier = 'plus')
  INTO v_is_plus
  FROM public.user_entitlements ue
  WHERE ue.user_id = v_me;

  v_is_plus := COALESCE(v_is_plus, false);

  IF v_is_plus THEN
    SELECT cp.last_delivered_at, cp.last_read_at
    INTO v_other_last_delivered_at, v_other_last_read_at
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.user_id <> v_me
    LIMIT 1;

    v_delivered := (
      v_last_sender_id = v_me
      AND v_last_message_at IS NOT NULL
      AND v_other_last_delivered_at IS NOT NULL
      AND v_other_last_delivered_at >= v_last_message_at
    );

    v_seen := (
      v_last_sender_id = v_me
      AND v_last_message_at IS NOT NULL
      AND v_other_last_read_at IS NOT NULL
      AND v_other_last_read_at >= v_last_message_at
    );

    v_out := v_out || jsonb_build_object(
      'read_receipt',
      jsonb_build_object(
        'last_message_at', v_last_message_at,
        'last_sender_id', v_last_sender_id,
        'other_last_delivered_at', v_other_last_delivered_at,
        'other_last_read_at', v_other_last_read_at,
        'delivered', v_delivered,
        'seen', v_seen
      )
    );
  ELSE
    -- Explicitly return null so free users can't infer receipt data.
    v_out := v_out || jsonb_build_object('read_receipt', NULL);
  END IF;

  RETURN v_out;
END;
$$;

ALTER FUNCTION public.get_conversation_messages(uuid, timestamptz, bigint, int) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, timestamptz, bigint, int) TO authenticated;

