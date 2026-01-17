-- ============================================================================
-- Migration: Fix read-receipt entitlement gating (use user_entitlements.plan_code)
--
-- Problem:
-- - get_conversation_messages was gating on user_entitlements.tier, but the real
--   schema uses:
--     - plan_code text
--     - expires_at timestamptz
--
-- Fix:
-- - Gate read receipts strictly on:
--     plan_code = 'plus' AND (expires_at IS NULL OR expires_at > now())
-- ============================================================================

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

  -- Delivered: caller has fetched the thread (conditional write only).
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

  -- Paid gating (one-sided premium): Plus users only.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_entitlements ue
    WHERE ue.user_id = v_me
      AND ue.plan_code = 'plus'
      AND (ue.expires_at IS NULL OR ue.expires_at > now())
  )
  INTO v_is_plus;

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
    v_out := v_out || jsonb_build_object('read_receipt', NULL);
  END IF;

  RETURN v_out;
END;
$$;

ALTER FUNCTION public.get_conversation_messages(uuid, timestamptz, bigint, int) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(uuid, timestamptz, bigint, int) TO authenticated;

