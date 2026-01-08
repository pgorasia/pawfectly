-- ============================================================================
-- Fix get_feed_basic: include hero photo using pick_hero_photo (priority + seed)
-- and keep SECURITY DEFINER anti-spoofing (use auth.uid()).
-- ============================================================================

-- Drop old signatures (both the pre-fix spoofable one and the current reduced one)
DROP FUNCTION IF EXISTS public.get_feed_basic(uuid, int);
DROP FUNCTION IF EXISTS public.get_feed_basic(int);

CREATE FUNCTION public.get_feed_basic(
  p_limit int default 20
)
RETURNS TABLE(
  candidate_id uuid,
  human_name text,
  city text,
  dog_name text,
  hero_photo_storage_path text,
  hero_photo_bucket_type text,
  hero_photo_id uuid
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

  RETURN QUERY
  WITH candidates AS (
    SELECT p.user_id, p.display_name, p.city
    FROM public.profiles p
    -- Anti-join: exclude users you blocked
    LEFT JOIN public.blocked_users bu_blocked_by_me
      ON bu_blocked_by_me.blocker_id = v_viewer_id
     AND bu_blocked_by_me.blocked_id = p.user_id
    -- Anti-join: exclude users who blocked you
    LEFT JOIN public.blocked_users bu_blocked_me
      ON bu_blocked_me.blocker_id = p.user_id
     AND bu_blocked_me.blocked_id = v_viewer_id
    WHERE p.user_id <> v_viewer_id
      AND p.lifecycle_status IN ('active', 'limited')
      AND COALESCE(p.is_hidden, false) = false
      AND p.deleted_at IS NULL
      AND bu_blocked_by_me.id IS NULL
      AND bu_blocked_me.id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.swipes s
        WHERE s.viewer_id = v_viewer_id
          AND s.candidate_id = p.user_id
          AND (
            s.action IN ('reject','accept')
            OR (s.action = 'pass' AND s.created_at >= NOW() - INTERVAL '24 hours')
          )
      )
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT p_limit
  ),
  primary_dog AS (
    SELECT
      d.user_id,
      (array_agg(d.name ORDER BY d.slot))[1] AS dog_name
    FROM public.dogs d
    WHERE d.is_active = true
    GROUP BY d.user_id
  ),
  best_dog_slot AS (
    -- "Prefer slot 1 else lowest active slot" == min(slot) if slots are 1..3
    SELECT
      d.user_id,
      MIN(d.slot) AS best_dog_slot
    FROM public.dogs d
    WHERE d.is_active = true
    GROUP BY d.user_id
  )
  SELECT
    c.user_id AS candidate_id,
    c.display_name AS human_name,
    c.city,
    COALESCE(pd.dog_name, '') AS dog_name,
    hp.storage_path AS hero_photo_storage_path,
    hp.bucket_type AS hero_photo_bucket_type,
    hp.photo_id AS hero_photo_id
  FROM candidates c
  LEFT JOIN primary_dog pd
    ON pd.user_id = c.user_id
  LEFT JOIN best_dog_slot bds
    ON bds.user_id = c.user_id
  -- Use your authoritative hero rules (priority + seeded weekly randomness)
  LEFT JOIN LATERAL public.pick_hero_photo(
    c.user_id,
    v_viewer_id,
    bds.best_dog_slot
  ) hp ON TRUE;

END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_basic(int) TO authenticated;
