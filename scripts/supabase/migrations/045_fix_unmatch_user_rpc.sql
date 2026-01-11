-- ============================================================================
-- Migration: Fix unmatch_user RPC
-- - Removes insertion into blocked_users (unmatch should not block)
-- - Registers "pass" for candidate in all active lanes (pals and match)
-- - Closes conversation for both users (no notifications)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unmatch_user(
  p_target_id uuid,
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_convo uuid := p_conversation_id;
  v_low uuid;
  v_high uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_target_id IS NULL OR p_target_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  -- Register "pass" for candidate in all active lanes (pals and match)
  -- Use long skip period (9999 days) to effectively remove them
  -- Note: record_skip may fail if the user doesn't have swipes in that lane, so we use PERFORM
  BEGIN
    PERFORM public.record_skip(p_target_id, 'pals', 9999);
  EXCEPTION WHEN OTHERS THEN
    -- Ignore errors (user might not have pals lane active)
    NULL;
  END;

  BEGIN
    PERFORM public.record_skip(p_target_id, 'match', 9999);
  EXCEPTION WHEN OTHERS THEN
    -- Ignore errors (user might not have match lane active)
    NULL;
  END;

  -- If conversation_id not provided, derive it from pair (if it exists)
  IF v_convo IS NULL THEN
    v_low := LEAST(v_me, p_target_id);
    v_high := GREATEST(v_me, p_target_id);

    SELECT id INTO v_convo
    FROM public.conversations
    WHERE user_low = v_low AND user_high = v_high
    LIMIT 1;
  END IF;

  -- Close conversation for both users (no notifications per requirements)
  IF v_convo IS NOT NULL THEN
    PERFORM public.close_conversation(v_convo, false, 'unmatch');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'target_id', p_target_id,
    'conversation_id', v_convo
  );
END;
$$;
