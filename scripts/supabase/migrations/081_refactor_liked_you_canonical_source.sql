-- ============================================================================
-- Migration: Canonical source for "Liked You" visibility
--
-- Problem:
-- - We had duplicated eligibility logic in:
--   - public.get_liked_you_page(...)
--   - public.is_in_my_liked_you(uuid)
-- - Duplicated WHERE clauses drift over time and cause UX inconsistencies.
--
-- Solution:
-- - Introduce ONE canonical, auth.uid()-scoped function:
--     public._my_liked_you_visible(...)
--   that encapsulates all eligibility rules (blocks, suppressions, prior actions,
--   and cross-lane pending exclusion).
-- - Re-implement:
--   - public.get_liked_you_page(...) as a thin wrapper over _my_liked_you_visible
--
-- Notes:
-- - We keep the public.get_liked_you_page signature stable to avoid PostgREST
--   overload ambiguity (see migration 060).
-- ============================================================================

-- Repo cleanup: if an earlier migration created this helper, remove it.
DROP FUNCTION IF EXISTS public.is_in_my_liked_you(uuid);

CREATE OR REPLACE FUNCTION public._my_liked_you_visible(
  p_liker_id uuid DEFAULT NULL,
  p_limit integer DEFAULT NULL,
  p_cursor_liked_at timestamptz DEFAULT NULL,
  p_cursor_liker_id uuid DEFAULT NULL
)
RETURNS TABLE(
  liker_id uuid,
  liked_at timestamptz,
  display_name text,
  city text,
  dog_name text,
  hero_photo_storage_path text,
  hero_photo_bucket_type text,
  hero_photo_id uuid,
  lane text,
  badge_lane text,
  requires_lane_choice boolean,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      s.viewer_id AS liker_id,
      s.created_at AS liked_at,
      s.lane AS lane
    FROM public.swipes s
    WHERE s.candidate_id = v_user_id
      AND s.action = 'accept'
      AND (p_liker_id IS NULL OR s.viewer_id = p_liker_id)
      AND (
        p_cursor_liked_at IS NULL
        OR s.created_at < p_cursor_liked_at
        OR (s.created_at = p_cursor_liked_at AND s.viewer_id < p_cursor_liker_id)
      )
    ORDER BY s.created_at DESC, s.viewer_id DESC
    LIMIT COALESCE(p_limit, 2147483647)
  ),

  best_dog AS (
    SELECT
      d.user_id,
      MIN(d.slot) AS best_dog_slot,
      (array_agg(d.name ORDER BY d.slot))[1] AS dog_name
    FROM public.dogs d
    WHERE d.is_active = true
    GROUP BY d.user_id
  ),

  visible AS (
    SELECT
      b.liker_id,
      b.liked_at,
      b.lane,
      p.display_name,
      p.city
    FROM base b
    JOIN public.profiles p
      ON p.user_id = b.liker_id
    LEFT JOIN public.blocked_users bu_blocked_by_me
      ON bu_blocked_by_me.blocker_id = v_user_id
     AND bu_blocked_by_me.blocked_id = b.liker_id
    LEFT JOIN public.blocked_users bu_blocked_me
      ON bu_blocked_me.blocker_id = b.liker_id
     AND bu_blocked_me.blocked_id = v_user_id
    WHERE p.lifecycle_status IN ('active', 'limited')
      AND COALESCE(p.is_hidden, false) = false
      AND p.deleted_at IS NULL
      AND bu_blocked_by_me.id IS NULL
      AND bu_blocked_me.id IS NULL

      -- Exclude anyone I've already hard-acted on in swipes (accept/reject)
      AND NOT EXISTS (
        SELECT 1
        FROM public.swipes my
        WHERE my.viewer_id = v_user_id
          AND my.candidate_id = b.liker_id
          AND my.action IN ('accept','reject')
      )

      -- Exclude only hard "no" suppressions (reject/cross-lane cooldown), but NOT skip
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_suppressions us
        WHERE us.actor_id = v_user_id
          AND us.target_id = b.liker_id
          AND (
            us.blocked_at IS NOT NULL
            OR us.reported_at IS NOT NULL
            OR us.match_pass_until > now()
            OR us.match_pass_until = 'infinity'::timestamptz
          )
      )

      -- Exclude any cross-lane pending pairs (these are shown in Messages)
      AND NOT EXISTS (
        SELECT 1
        FROM public.cross_lane_connections cl
        WHERE cl.user_low = LEAST(v_user_id, b.liker_id)
          AND cl.user_high = GREATEST(v_user_id, b.liker_id)
          AND cl.status = 'pending'
      )
  )

  SELECT
    v.liker_id,
    v.liked_at,
    v.display_name,
    v.city,
    COALESCE(bd.dog_name, '') AS dog_name,
    hp.storage_path AS hero_photo_storage_path,
    hp.bucket_type  AS hero_photo_bucket_type,
    hp.photo_id     AS hero_photo_id,
    v.lane,
    v.lane AS badge_lane,
    false AS requires_lane_choice,
    NULL::timestamptz AS expires_at
  FROM visible v
  LEFT JOIN best_dog bd
    ON bd.user_id = v.liker_id
  LEFT JOIN LATERAL public.pick_hero_photo(
    v.liker_id,
    v_user_id,
    bd.best_dog_slot
  ) hp ON TRUE
  ORDER BY v.liked_at DESC, v.liker_id DESC;
END;
$$;

-- Keep public RPC signature stable (no overload ambiguity)
CREATE OR REPLACE FUNCTION public.get_liked_you_page(
  p_limit integer DEFAULT 20,
  p_cursor_liked_at timestamptz DEFAULT NULL,
  p_cursor_liker_id uuid DEFAULT NULL
)
RETURNS TABLE(
  liker_id uuid,
  liked_at timestamptz,
  display_name text,
  city text,
  dog_name text,
  hero_photo_storage_path text,
  hero_photo_bucket_type text,
  hero_photo_id uuid,
  lane text,
  badge_lane text,
  requires_lane_choice boolean,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public._my_liked_you_visible(
    NULL,
    p_limit,
    p_cursor_liked_at,
    p_cursor_liker_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_liked_you_page(integer, timestamptz, uuid) TO authenticated;

