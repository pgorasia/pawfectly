-- Migration: Create blocked_users table
-- This allows users to block or report other users, preventing them from appearing in feeds

-- ============================================================================
-- BLOCKED_USERS TABLE: Stores blocked/reported users
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT CHECK (reason IN ('block', 'report')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique constraint: prevent duplicate blocks
  CONSTRAINT uq_blocked_users_blocker_blocked 
    UNIQUE (blocker_id, blocked_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker 
  ON public.blocked_users(blocker_id);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked 
  ON public.blocked_users(blocked_id);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can view their own blocked users
DROP POLICY IF EXISTS "Users can read their own blocked users" ON public.blocked_users;
CREATE POLICY "Users can read their own blocked users"
  ON public.blocked_users
  FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can insert their own blocks
DROP POLICY IF EXISTS "Users can insert their own blocks" ON public.blocked_users;
CREATE POLICY "Users can insert their own blocks"
  ON public.blocked_users
  FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can delete their own blocks (unblock)
DROP POLICY IF EXISTS "Users can delete their own blocks" ON public.blocked_users;
CREATE POLICY "Users can delete their own blocks"
  ON public.blocked_users
  FOR DELETE
  USING (auth.uid() = blocker_id);

-- ============================================================================
-- UPDATE FEED FUNCTION TO EXCLUDE BLOCKED USERS
-- ============================================================================

-- Update get_feed_basic RPC to exclude blocked users
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
AS $$
WITH candidates AS (
  SELECT p.user_id, p.display_name, p.city
  FROM public.profiles p
  WHERE p.user_id <> p_viewer_id
    AND p.lifecycle_status IN ('active', 'limited')
    -- Exclude blocked users (both directions)
    AND NOT EXISTS (
      SELECT 1
      FROM public.blocked_users bu
      WHERE (bu.blocker_id = p_viewer_id AND bu.blocked_id = p.user_id)
         OR (bu.blocker_id = p.user_id AND bu.blocked_id = p_viewer_id)
    )
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

ALTER FUNCTION public.get_feed_basic(uuid, int) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.get_feed_basic(uuid, int) TO authenticated;
