-- ============================================================================
-- Migration: Fix get_feed_page return type (json -> jsonb)
--
-- Problem:
-- - public.get_profile_view(...) returns `json` in this repo.
-- - public.get_feed_page(...) is declared to return `profile jsonb`.
-- - Selecting `get_profile_view(...) AS profile` causes:
--     "Returned type json does not match expected type jsonb in column 1."
--
-- Fix:
-- - Cast get_profile_view(...) to jsonb at the SELECT site.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_feed_page(
  p_limit int,
  p_cursor_updated_at timestamptz,
  p_cursor_user_id uuid,
  p_lane text
)
RETURNS TABLE(
  profile jsonb,
  cursor_updated_at timestamptz,
  cursor_user_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RAISE EXCEPTION 'invalid_lane';
  END IF;

  RETURN QUERY
  WITH c AS (
    SELECT *
    FROM public.get_feed_candidates(p_limit, p_cursor_updated_at, p_cursor_user_id, p_lane)
  )
  SELECT
    public.get_profile_view(c.candidate_id)::jsonb AS profile,
    c.cursor_updated_at,
    c.cursor_user_id
  FROM c
  ORDER BY c.cursor_updated_at DESC, c.cursor_user_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_page(int, timestamptz, uuid, text) TO authenticated;

