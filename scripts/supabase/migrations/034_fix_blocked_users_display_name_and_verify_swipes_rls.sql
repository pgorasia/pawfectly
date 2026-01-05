-- Migration: Fix blocked users display name fetching and implement secure undo
-- Bug 1: Blocked users showing "User" instead of actual name
-- Bug 2: Permission denied when undoing swipes - use SECURITY DEFINER RPC instead

-- ============================================================================
-- BUG 1: Create function to get blocked users with display names
-- ============================================================================
-- This function uses SECURITY DEFINER to bypass RLS and fetch display_name
-- for blocked users, which is needed for the blocked users list

CREATE OR REPLACE FUNCTION public.get_blocked_users_with_names(
  p_blocker_id uuid
)
RETURNS TABLE(
  id uuid,
  blocked_id uuid,
  reason text,
  created_at timestamptz,
  display_name text,
  city text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 
    bu.id,
    bu.blocked_id,
    bu.reason,
    bu.created_at,
    p.display_name,
    p.city
  FROM public.blocked_users bu
  LEFT JOIN public.profiles p ON p.user_id = bu.blocked_id
  WHERE bu.blocker_id = p_blocker_id
  ORDER BY bu.created_at DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_blocked_users_with_names(uuid) TO authenticated;

-- ============================================================================
-- BUG 2: Create RPC function for undo functionality
-- ============================================================================
-- Instead of allowing direct DELETE on swipes table, use SECURITY DEFINER RPC
-- This is more secure and follows best practices

CREATE OR REPLACE FUNCTION public.undo_last_reject()
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

  WITH last_reject AS (
    SELECT id, candidate_id
    FROM public.swipes
    WHERE viewer_id = v_viewer
      AND action = 'reject'
    ORDER BY created_at DESC
    LIMIT 1
  ),
  deleted AS (
    DELETE FROM public.swipes s
    USING last_reject lr
    WHERE s.id = lr.id
    RETURNING lr.candidate_id
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
GRANT EXECUTE ON FUNCTION public.undo_last_reject() TO authenticated;
