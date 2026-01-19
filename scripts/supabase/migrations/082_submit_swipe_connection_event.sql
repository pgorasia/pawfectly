-- ============================================================================
-- Migration: submit_swipe returns connection event for feed UX
--
-- Goal:
-- - Allow the client to show a "connection completed" celebration without an
--   extra roundtrip.
-- - Only the SECOND liker (the one whose accept completes the pair) should get
--   the signal.
-- - Cross-lane: only the Pals-liker (chooser) gets a dedicated event.
--
-- Notes:
-- - This is backward-compatible: we only ADD new JSON keys.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_swipe(
  p_candidate_id uuid,
  p_action text,
  p_lane text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_day date := (now() AT TIME ZONE 'utc')::date;

  v_prev_action text;
  v_limit int;
  v_used int;

  v_reverse_same boolean := false;
  v_cross_lane_pending boolean := false;
BEGIN
  IF v_viewer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- ensure entitlements exist BEFORE reading limits
  PERFORM public.ensure_user_entitlements(v_viewer_id);

  IF p_candidate_id IS NULL OR p_candidate_id = v_viewer_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_candidate');
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lane');
  END IF;

  IF p_action NOT IN ('reject','pass','accept') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  -- Serialize per viewer to prevent double quota burn on retry/concurrency
  PERFORM pg_advisory_xact_lock(hashtext(v_viewer_id::text));

  -- Read existing swipe (if any)
  SELECT s.action
    INTO v_prev_action
  FROM public.swipes s
  WHERE s.viewer_id = v_viewer_id
    AND s.candidate_id = p_candidate_id
    AND s.lane = p_lane
  FOR UPDATE;

  -- Consume quota ONLY when transitioning into accept
  IF p_action = 'accept' AND COALESCE(v_prev_action, '') <> 'accept' THEN
    v_limit := public.get_daily_like_limit(v_viewer_id, p_lane); -- NULL = unlimited

    IF v_limit IS NOT NULL THEN
      INSERT INTO public.daily_like_usage(user_id, day_utc, lane, likes_used)
      VALUES (v_viewer_id, v_day, p_lane, 0)
      ON CONFLICT (user_id, day_utc, lane) DO NOTHING;

      SELECT likes_used INTO v_used
      FROM public.daily_like_usage
      WHERE user_id = v_viewer_id AND day_utc = v_day AND lane = p_lane
      FOR UPDATE;

      IF v_used >= v_limit THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'daily_limit_reached',
          'lane', p_lane,
          'limit', v_limit,
          'used', v_used
        );
      END IF;

      UPDATE public.daily_like_usage
      SET likes_used = likes_used + 1,
          updated_at = now()
      WHERE user_id = v_viewer_id AND day_utc = v_day AND lane = p_lane;

      v_used := v_used + 1;
    ELSE
      v_used := NULL; -- unlimited
    END IF;
  ELSE
    -- Non-accept actions don’t consume; still return remaining if we can
    v_limit := public.get_daily_like_limit(v_viewer_id, p_lane);
    IF v_limit IS NULL THEN
      v_used := NULL;
    ELSE
      SELECT COALESCE(likes_used, 0) INTO v_used
      FROM public.daily_like_usage
      WHERE user_id = v_viewer_id AND day_utc = v_day AND lane = p_lane;
    END IF;
  END IF;

  -- Upsert swipe record
  INSERT INTO public.swipes(viewer_id, candidate_id, lane, action, created_at)
  VALUES (v_viewer_id, p_candidate_id, p_lane, p_action, now())
  ON CONFLICT (viewer_id, candidate_id, lane)
  DO UPDATE SET action = EXCLUDED.action, created_at = now();

  -- Connection event detection (only on new accepts)
  IF p_action = 'accept' AND COALESCE(v_prev_action, '') <> 'accept' THEN
    -- Same-lane mutual?
    SELECT EXISTS (
      SELECT 1
      FROM public.swipes s
      WHERE s.viewer_id = p_candidate_id
        AND s.candidate_id = v_viewer_id
        AND s.lane = p_lane
        AND s.action = 'accept'
    ) INTO v_reverse_same;

    -- Create cross-lane pending record (idempotent) when a cross-lane mutual is formed.
    -- Keep behavior aligned with current DB: always call the helper on new accepts.
    -- The helper itself will no-op for same-lane mutuals.
    v_cross_lane_pending := public.create_cross_lane_pending_if_needed(v_viewer_id, p_candidate_id, p_lane);
  END IF;

  -- Recompute limit (tier could be updated)
  v_limit := public.get_daily_like_limit(v_viewer_id, p_lane);

  RETURN jsonb_build_object(
    'ok', true,
    'lane', p_lane,
    'remaining_accepts',
      CASE
        WHEN v_limit IS NULL THEN NULL
        ELSE GREATEST(v_limit - COALESCE(v_used, 0), 0)
      END,
    -- New: connection event (client can show celebration without extra calls)
    'connection_event',
      CASE
        WHEN v_reverse_same THEN jsonb_build_object(
          'type', 'mutual',
          'lane', p_lane,
          'other_user_id', p_candidate_id
        )
        WHEN v_cross_lane_pending AND p_lane = 'pals' THEN jsonb_build_object(
          'type', 'cross_lane_chooser',
          'other_user_id', p_candidate_id
        )
        ELSE NULL
      END
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.submit_swipe(uuid, text, text) TO authenticated;

