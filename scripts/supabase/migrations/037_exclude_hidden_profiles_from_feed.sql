-- Migration: Exclude hidden profiles from feed
-- Add filter to get_feed_basic to exclude profiles where is_hidden = true

CREATE OR REPLACE FUNCTION public.get_feed_basic(
  p_viewer_id uuid,
  p_limit int default 20
)
RETURNS TABLE(
  candidate_id uuid,
  human_name text,
  city text,
  dog_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH candidates AS (
  SELECT p.user_id, p.display_name, p.city
  FROM public.profiles p
  -- Anti-join: exclude users you blocked
  LEFT JOIN public.blocked_users bu_blocked_by_me 
    ON bu_blocked_by_me.blocker_id = p_viewer_id 
    AND bu_blocked_by_me.blocked_id = p.user_id
  -- Anti-join: exclude users who blocked you
  LEFT JOIN public.blocked_users bu_blocked_me 
    ON bu_blocked_me.blocker_id = p.user_id 
    AND bu_blocked_me.blocked_id = p_viewer_id
  WHERE p.user_id <> p_viewer_id
    AND p.lifecycle_status IN ('active', 'limited')
    AND COALESCE(p.is_hidden, false) = false
    -- Exclude if blocked in either direction (cheap anti-join)
    AND bu_blocked_by_me.id IS NULL
    AND bu_blocked_me.id IS NULL
    -- Exclude already swiped users
    AND NOT EXISTS (
      SELECT 1
      FROM public.swipes s
      WHERE s.viewer_id = p_viewer_id
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
)
SELECT
  c.user_id AS candidate_id,
  c.display_name AS human_name,
  c.city,
  COALESCE(pd.dog_name, '') AS dog_name
FROM candidates c
LEFT JOIN primary_dog pd ON pd.user_id = c.user_id;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_feed_basic(uuid, int) TO authenticated;
