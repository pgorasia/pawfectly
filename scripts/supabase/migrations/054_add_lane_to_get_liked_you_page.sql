-- ============================================================================
-- Migration: Add lane field to get_liked_you_page function
-- The function now returns the lane (pals/match) where the candidate sent the like
-- This is required for filtering and displaying the correct lane badge on the frontend
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_liked_you_page(
  p_limit int DEFAULT 20,
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
  lane text
)
LANGUAGE plpgsql
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
      AND (
        p_cursor_liked_at IS NULL
        OR s.created_at < p_cursor_liked_at
        OR (s.created_at = p_cursor_liked_at AND s.viewer_id < p_cursor_liker_id)
      )
    ORDER BY s.created_at DESC, s.viewer_id DESC
    LIMIT p_limit
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
  )
  SELECT
    v.liker_id,
    v.liked_at,
    v.display_name,
    v.city,
    COALESCE(ds.dog_name, '') AS dog_name,
    hp.storage_path AS hero_photo_storage_path,
    hp.bucket_type  AS hero_photo_bucket_type,
    hp.photo_id     AS hero_photo_id,
    v.lane
  FROM visible v
  LEFT JOIN LATERAL (
    SELECT
      MIN(d.slot) AS best_dog_slot,
      (array_agg(d.name ORDER BY d.slot))[1] AS dog_name
    FROM public.dogs d
    WHERE d.user_id = v.liker_id
      AND d.is_active = true
  ) ds ON TRUE
  LEFT JOIN LATERAL public.pick_hero_photo(
    v.liker_id,
    v_user_id,
    ds.best_dog_slot
  ) hp ON TRUE
  ORDER BY v.liked_at DESC, v.liker_id DESC;
END;
$$;
