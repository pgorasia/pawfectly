-- ============================================================================
-- Migration: Boost-aware feed ordering (with reported-user deprioritization)
--
-- Goals:
-- - Promote candidates with an active boost near the top of the feed.
-- - Keep "reported/low" moderation status deprioritized ABOVE ALL other sorting
--   (i.e., even boosted users with status='low' should be pushed down).
-- - Preserve correct cursor/keyset pagination by making the cursor follow the
--   exact same ordering keys used for sorting.
--
-- Approach:
-- - Compute an "effective" sort timestamp:
--     ord_effective_updated_at =
--       ord_updated_at
--       + (boost ? +100 years : 0)
--       + (reported_low ? -1000 years : 0)
-- - Use ord_effective_updated_at + user_id as the keyset order/cursor.
-- - Return cursor_updated_at as ord_effective_updated_at (opaque to clients).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_feed_candidates(
  p_limit int,
  p_cursor_updated_at timestamptz,
  p_cursor_user_id uuid,
  p_lane text
)
RETURNS TABLE(
  candidate_id uuid,
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
  WITH
  viewer AS (
    SELECT
      pr.user_id AS viewer_id,
      pr.pals_enabled,
      pr.match_enabled,

      pr.pals_preferred_genders,
      pr.pals_age_min, pr.pals_age_max, pr.pals_distance_miles,

      pr.match_preferred_genders,
      pr.match_age_min, pr.match_age_max, pr.match_distance_miles,

      vp.gender AS viewer_gender,
      vp.dob    AS viewer_dob,
      vp.latitude  AS viewer_lat,
      vp.longitude AS viewer_lon
    FROM public.preferences pr
    JOIN public.profiles vp ON vp.user_id = pr.user_id
    WHERE pr.user_id = v_viewer_id
  ),
  lane_cfg AS (
    SELECT
      v.*,
      CASE WHEN p_lane='pals' THEN v.pals_enabled ELSE v.match_enabled END AS lane_enabled,
      CASE WHEN p_lane='pals' THEN v.pals_distance_miles ELSE v.match_distance_miles END AS lane_distance_miles
    FROM viewer v
  ),
  active_boosts AS (
    -- Distinct list of users currently boosted.
    -- Note: sessions are ended server-side when read by get_my_boost_status(),
    -- but we defensively use ends_at > now() as well.
    SELECT DISTINCT s.user_id
    FROM public.user_boost_sessions s
    WHERE s.status = 'active'
      AND s.ends_at > now()
  ),
  base0 AS (
    SELECT
      p.user_id,
      COALESCE(p.updated_at, '1970-01-01'::timestamptz) AS ord_updated_at,

      p.gender AS cand_gender,
      p.dob    AS cand_dob,
      p.latitude  AS cand_lat,
      p.longitude AS cand_lon,

      cp.pals_enabled  AS cand_pals_enabled,
      cp.match_enabled AS cand_match_enabled,

      public.haversine_miles(l.viewer_lat, l.viewer_lon, p.latitude, p.longitude) AS dist_miles,

      l.pals_preferred_genders,
      l.pals_age_min, l.pals_age_max, l.pals_distance_miles,
      l.match_preferred_genders,
      l.match_age_min, l.match_age_max, l.match_distance_miles,

      cp.match_preferred_genders AS cand_match_preferred_genders,
      cp.match_age_min AS cand_match_age_min,
      cp.match_age_max AS cand_match_age_max,
      cp.match_distance_miles AS cand_match_distance_miles,

      l.pals_enabled  AS viewer_pals_enabled,
      l.match_enabled AS viewer_match_enabled,
      l.viewer_gender,
      l.viewer_dob,
      l.lane_distance_miles,
      l.viewer_lat,
      l.viewer_lon,

      COALESCE(ums.status, 'normal') AS cand_mod_status,
      (ab.user_id IS NOT NULL) AS cand_is_boosted

    FROM lane_cfg l
    JOIN public.profiles p
      ON p.user_id <> l.viewer_id
    JOIN public.preferences cp
      ON cp.user_id = p.user_id

    LEFT JOIN public.user_moderation_state ums
      ON ums.user_id = p.user_id

    LEFT JOIN active_boosts ab
      ON ab.user_id = p.user_id

    LEFT JOIN public.blocked_users bu_blocked_by_me
      ON bu_blocked_by_me.blocker_id = l.viewer_id
     AND bu_blocked_by_me.blocked_id = p.user_id
    LEFT JOIN public.blocked_users bu_blocked_me
      ON bu_blocked_me.blocker_id = p.user_id
     AND bu_blocked_me.blocked_id = l.viewer_id

    WHERE l.lane_enabled = true
      AND p.lifecycle_status IN ('active','limited')
      AND COALESCE(p.is_hidden, false) = false
      AND p.deleted_at IS NULL
      AND bu_blocked_by_me.id IS NULL
      AND bu_blocked_me.id IS NULL

      -- moderation
      AND COALESCE(ums.status, 'normal') <> 'banned'

      -- candidate must have lane enabled
      AND (
        (p_lane='pals'  AND cp.pals_enabled  = true)
        OR
        (p_lane='match' AND cp.match_enabled = true)
      )

      -- lane suppression
      AND NOT public.is_suppressed_in_lane(l.viewer_id, p.user_id, p_lane)

      -- hard actions hide everywhere
      AND NOT EXISTS (
        SELECT 1
        FROM public.swipes s
        WHERE s.viewer_id = l.viewer_id
          AND s.candidate_id = p.user_id
          AND s.action IN ('reject','accept')
      )

      -- bounding box prefilter
      AND (
        l.lane_distance_miles IS NULL
        OR (
          l.viewer_lat IS NOT NULL AND l.viewer_lon IS NOT NULL
          AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
          AND p.latitude BETWEEN
              (l.viewer_lat - (l.lane_distance_miles / 69.0))
          AND (l.viewer_lat + (l.lane_distance_miles / 69.0))
          AND p.longitude BETWEEN
              (l.viewer_lon - (l.lane_distance_miles / (69.0 * GREATEST(cos(radians(l.viewer_lat)), 0.01))))
          AND (l.viewer_lon + (l.lane_distance_miles / (69.0 * GREATEST(cos(radians(l.viewer_lat)), 0.01))))
        )
      )
  ),
  base AS (
    SELECT
      b0.*,
      (
        b0.ord_updated_at
        + CASE WHEN COALESCE(b0.cand_mod_status, 'normal') = 'low' THEN interval '-1000 years' ELSE interval '0' END
        + CASE WHEN b0.cand_is_boosted THEN interval '100 years' ELSE interval '0' END
      ) AS ord_effective_updated_at
    FROM base0 b0
    -- cursor pagination (keyset) must match the ORDER BY keys exactly
    WHERE
      p_cursor_updated_at IS NULL
      OR (
        (
          (
            b0.ord_updated_at
            + CASE WHEN COALESCE(b0.cand_mod_status, 'normal') = 'low' THEN interval '-1000 years' ELSE interval '0' END
            + CASE WHEN b0.cand_is_boosted THEN interval '100 years' ELSE interval '0' END
          ) < p_cursor_updated_at
        )
        OR (
          (
            b0.ord_updated_at
            + CASE WHEN COALESCE(b0.cand_mod_status, 'normal') = 'low' THEN interval '-1000 years' ELSE interval '0' END
            + CASE WHEN b0.cand_is_boosted THEN interval '100 years' ELSE interval '0' END
          ) = p_cursor_updated_at
          AND b0.user_id < p_cursor_user_id
        )
      )
  ),
  scored AS (
    SELECT
      b.*,

      -- pals one-way
      (
        b.viewer_pals_enabled = true
        AND b.cand_pals_enabled = true
        AND NOT public.is_suppressed_in_lane(v_viewer_id, b.user_id, 'pals')
        AND (
          b.pals_preferred_genders IS NULL OR cardinality(b.pals_preferred_genders)=0
          OR (b.cand_gender IS NOT NULL AND b.cand_gender = ANY(b.pals_preferred_genders))
        )
        AND (
          (b.pals_age_min IS NULL AND b.pals_age_max IS NULL)
          OR (
            b.cand_dob IS NOT NULL
            AND (b.pals_age_min IS NULL OR b.cand_dob <= (current_date - (b.pals_age_min || ' years')::interval))
            AND (b.pals_age_max IS NULL OR b.cand_dob >= (current_date - (b.pals_age_max || ' years')::interval))
          )
        )
        AND (
          b.pals_distance_miles IS NULL
          OR (b.dist_miles IS NOT NULL AND b.dist_miles <= b.pals_distance_miles)
        )
      ) AS pals_ok,

      -- match mutual
      (
        b.viewer_match_enabled = true
        AND b.cand_match_enabled = true
        AND NOT public.is_suppressed_in_lane(v_viewer_id, b.user_id, 'match')

        -- viewer -> candidate
        AND (
          b.match_preferred_genders IS NULL OR cardinality(b.match_preferred_genders)=0
          OR (b.cand_gender IS NOT NULL AND b.cand_gender = ANY(b.match_preferred_genders))
        )
        AND (
          (b.match_age_min IS NULL AND b.match_age_max IS NULL)
          OR (
            b.cand_dob IS NOT NULL
            AND (b.match_age_min IS NULL OR b.cand_dob <= (current_date - (b.match_age_min || ' years')::interval))
            AND (b.match_age_max IS NULL OR b.cand_dob >= (current_date - (b.match_age_max || ' years')::interval))
          )
        )
        AND (
          b.match_distance_miles IS NULL
          OR (b.dist_miles IS NOT NULL AND b.dist_miles <= b.match_distance_miles)
        )

        -- candidate -> viewer
        AND (
          b.cand_match_preferred_genders IS NULL OR cardinality(b.cand_match_preferred_genders)=0
          OR (b.viewer_gender IS NOT NULL AND b.viewer_gender = ANY(b.cand_match_preferred_genders))
        )
        AND (
          (b.cand_match_age_min IS NULL AND b.cand_match_age_max IS NULL)
          OR (
            b.viewer_dob IS NOT NULL
            AND (b.cand_match_age_min IS NULL OR b.viewer_dob <= (current_date - (b.cand_match_age_min || ' years')::interval))
            AND (b.cand_match_age_max IS NULL OR b.viewer_dob >= (current_date - (b.cand_match_age_max || ' years')::interval))
          )
        )
        AND (
          b.cand_match_distance_miles IS NULL
          OR (b.dist_miles IS NOT NULL AND b.dist_miles <= b.cand_match_distance_miles)
        )
      ) AS match_ok

    FROM base b
  ),
  filtered AS (
    SELECT *
    FROM scored s
    WHERE
      (p_lane='match' AND s.match_ok=true)
      OR
      (
        p_lane='pals'
        AND s.pals_ok=true
        -- Match-first priority
        AND NOT (s.viewer_match_enabled=true AND s.match_ok=true)
      )
    ORDER BY
      -- Boost near the top, but "low" moderation is penalized much harder,
      -- so it always ends up lower even if boosted.
      s.ord_effective_updated_at DESC,
      s.user_id DESC
    LIMIT p_limit
  )
  SELECT
    f.user_id AS candidate_id,
    f.ord_effective_updated_at AS cursor_updated_at,
    f.user_id AS cursor_user_id
  FROM filtered f;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_candidates(int, timestamptz, uuid, text) TO authenticated;


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
    public.get_profile_view(c.candidate_id) AS profile,
    c.cursor_updated_at,
    c.cursor_user_id
  FROM c
  ORDER BY c.cursor_updated_at DESC, c.cursor_user_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_page(int, timestamptz, uuid, text) TO authenticated;

