-- Migration: Add RPC function to undo last pass swipe
-- Similar to undo_last_reject, but handles pass swipes
-- Uses SECURITY DEFINER to bypass RLS for secure swipe deletion

CREATE OR REPLACE FUNCTION public.undo_last_pass()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_candidate uuid;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  WITH last_pass AS (
    SELECT id, candidate_id
    FROM public.swipes
    WHERE viewer_id = v_viewer
      AND action = 'pass'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  deleted AS (
    DELETE FROM public.swipes s
    USING last_pass lp
    WHERE s.id = lp.id
    RETURNING lp.candidate_id
  )
  SELECT candidate_id INTO v_candidate
  FROM deleted;

  IF v_candidate IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nothing_to_undo');
  END IF;

  RETURN jsonb_build_object('ok', true, 'candidate_id', v_candidate);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.undo_last_pass() TO authenticated;

