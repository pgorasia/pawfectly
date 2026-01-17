-- ============================================================================
-- Migration: Plus-gated read receipts table (for realtime without leaking)
--
-- Goal:
-- - Keep chat read state in conversation_participants for unread counts etc.
-- - Provide a Plus-only readable surface for "seen" (last_read_at of the other user)
--   that can be subscribed to via Realtime without leaking to free users.
--
-- Design:
-- - public.conversation_read_receipts (conversation_id, user_id, last_read_at)
-- - RLS: only authenticated PLUS users who are participants can SELECT.
-- - Updated by security-definer RPC mark_conversation_read (only when advancing).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversation_read_receipts (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_read_receipts_conversation
  ON public.conversation_read_receipts (conversation_id);

ALTER TABLE public.conversation_read_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_read_receipts_select_plus_participants ON public.conversation_read_receipts;
CREATE POLICY conversation_read_receipts_select_plus_participants
  ON public.conversation_read_receipts
  FOR SELECT
  TO authenticated
  USING (
    -- Must be a participant in the conversation
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_read_receipts.conversation_id
        AND cp.user_id = auth.uid()
        AND cp.removed_at IS NULL
    )
    -- Must be Plus (one-sided premium)
    AND EXISTS (
      SELECT 1
      FROM public.user_entitlements ue
      WHERE ue.user_id = auth.uid()
        AND ue.plan_code = 'plus'
        AND (ue.expires_at IS NULL OR ue.expires_at > now())
    )
  );

-- No client-side INSERT/UPDATE/DELETE on this table (mutated via RPC).


-- ---------------------------------------------------------------------------
-- RPC: mark_conversation_read(p_conversation_id uuid)
-- - Conditional write for last_read_at in conversation_participants
-- - When it advances, also upsert into conversation_read_receipts (for Plus realtime)
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

  -- Only write receipt row if we actually advanced read state.
  IF v_updated > 0 THEN
    INSERT INTO public.conversation_read_receipts (conversation_id, user_id, last_read_at, updated_at)
    VALUES (p_conversation_id, v_me, now(), now())
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET
      last_read_at = EXCLUDED.last_read_at,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'success', true, 'updated', v_updated);
END;
$$;

ALTER FUNCTION public.mark_conversation_read(uuid) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- RPC: get_conversation_messages(...)
-- - Plus gating uses user_entitlements.plan_code (+ expiry)
-- - For Plus users, read_receipt is based on conversation_read_receipts (other user)
-- ---------------------------------------------------------------------------

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

  v_other_last_read_at timestamptz;
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

  -- Delivered: caller has fetched the thread (conditional write only).
  UPDATE public.conversation_participants cp
  SET last_delivered_at = now()
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND cp.conversation_id = p_conversation_id
    AND cp.user_id = v_me
    AND cp.removed_at IS NULL
    AND c.last_message_at IS NOT NULL
    AND (cp.last_delivered_at IS NULL OR cp.last_delivered_at < c.last_message_at);

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

  SELECT EXISTS (
    SELECT 1
    FROM public.user_entitlements ue
    WHERE ue.user_id = v_me
      AND ue.plan_code = 'plus'
      AND (ue.expires_at IS NULL OR ue.expires_at > now())
  )
  INTO v_is_plus;

  IF v_is_plus THEN
    SELECT rr.last_read_at
    INTO v_other_last_read_at
    FROM public.conversation_read_receipts rr
    WHERE rr.conversation_id = p_conversation_id
      AND rr.user_id <> v_me
    LIMIT 1;

    v_out := v_out || jsonb_build_object(
      'read_receipt',
      jsonb_build_object(
        'other_last_read_at', v_other_last_read_at
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

