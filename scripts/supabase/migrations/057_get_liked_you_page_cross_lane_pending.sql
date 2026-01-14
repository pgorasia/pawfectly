-- get_liked_you_page: include chooser-only cross-lane pending rows
-- - For viewer = pals_user_id in a pending cross-lane pair: include the liker row with
--   badge_lane = 'unknown' and requires_lane_choice = true (and expires_at for UI).
-- - For viewer = match_user_id: exclude that row entirely until resolved.

CREATE OR REPLACE FUNCTION public.get_liked_you_page(
  p_user_id uuid DEFAULT auth.uid(),
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  base AS (
    SELECT
      s.viewer_id AS liker_id,
      s.created_at AS liked_at,
      s.lane
    FROM public.swipes s
    WHERE s.candidate_id = p_user_id
      AND s.action = 'accept'
      AND (
        p_cursor_liked_at IS NULL
        OR (s.created_at, s.viewer_id) < (p_cursor_liked_at, p_cursor_liker_id)
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
      p.city,
      COALESCE(bd.dog_name, '') AS dog_name,
      hp.storage_path AS hero_photo_storage_path,
      hp.bucket_type AS hero_photo_bucket_type,
      hp.photo_id AS hero_photo_id,

      cl.pals_user_id AS cl_pals_user_id,
      cl.match_user_id AS cl_match_user_id,
      cl.expires_at AS cl_expires_at,
      cl.status AS cl_status
    FROM base b
    JOIN public.profiles p
      ON p.user_id = b.liker_id
    LEFT JOIN (
      SELECT
        d.user_id,
        MIN(d.slot) AS best_slot,
        (ARRAY_AGG(d.name ORDER BY d.slot))[1] AS dog_name
      FROM public.dogs d
      WHERE d.is_active = true
      GROUP BY d.user_id
    ) bd ON bd.user_id = b.liker_id
    LEFT JOIN LATERAL public.pick_hero_photo(b.liker_id, p_user_id, bd.best_slot) hp ON true

    -- Cross-lane pending row (if any) for this pair
    LEFT JOIN public.cross_lane_connections cl
      ON cl.user_low = LEAST(p_user_id, b.liker_id)
     AND cl.user_high = GREATEST(p_user_id, b.liker_id)
     AND cl.status = 'pending'

    LEFT JOIN public.blocked_users bu_blocked_by_me
      ON bu_blocked_by_me.blocker_id = p_user_id
     AND bu_blocked_by_me.blocked_id = b.liker_id
    LEFT JOIN public.blocked_users bu_blocked_me
      ON bu_blocked_me.blocker_id = b.liker_id
     AND bu_blocked_me.blocked_id = p_user_id

    WHERE p.lifecycle_status IN ('active', 'limited')
      AND COALESCE(p.is_hidden, false) = false
      AND p.deleted_at IS NULL
      AND bu_blocked_by_me.id IS NULL
      AND bu_blocked_me.id IS NULL

      -- Exclude cross-lane pending from the Match-liker until resolved
      AND NOT (
        cl.status = 'pending'
        AND cl.match_user_id = p_user_id
        AND cl.pals_user_id = b.liker_id
      )

      -- Exclude anyone I've already hard-acted on (accept/reject) in any lane,
      -- EXCEPT: allow chooser to see cross-lane pending even though they already accepted in the other lane.
      AND (
        NOT EXISTS (
          SELECT 1
          FROM public.swipes my
          WHERE my.viewer_id = p_user_id
            AND my.candidate_id = b.liker_id
            AND my.action IN ('accept','reject')
        )
        OR (
          cl.status = 'pending'
          AND cl.pals_user_id = p_user_id
          AND cl.match_user_id = b.liker_id
        )
      )

      -- Exclude only hard suppressions (reject/cross-lane cooldown), but NOT skip
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_suppressions us
        WHERE us.actor_id = p_user_id
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
    v.dog_name,
    v.hero_photo_storage_path,
    v.hero_photo_bucket_type,
    v.hero_photo_id,
    v.lane,

    CASE
      WHEN v.cl_status = 'pending'
       AND v.cl_pals_user_id = p_user_id
       AND v.cl_match_user_id = v.liker_id
      THEN 'unknown'
      ELSE v.lane
    END AS badge_lane,

    (
      v.cl_status = 'pending'
      AND v.cl_pals_user_id = p_user_id
      AND v.cl_match_user_id = v.liker_id
    ) AS requires_lane_choice,

    CASE
      WHEN v.cl_status = 'pending'
       AND v.cl_pals_user_id = p_user_id
       AND v.cl_match_user_id = v.liker_id
      THEN v.cl_expires_at
      ELSE NULL
    END AS expires_at

  FROM visible v
  ORDER BY v.liked_at DESC, v.liker_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_liked_you_page(uuid, integer, timestamptz, uuid) TO authenticated;
