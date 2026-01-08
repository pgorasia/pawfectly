-- Migration: Create loadMe() RPC function for optimized bootstrap data
-- Returns only fields needed for routing and initial rendering
-- This replaces the duplicate loadBootstrap() and loadUserData() patterns

CREATE OR REPLACE FUNCTION load_me()
RETURNS JSON AS $$
DECLARE
  result JSON;
  user_id_val UUID;
BEGIN
  -- Get current user ID from auth context
  user_id_val := auth.uid();
  
  IF user_id_val IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Check if onboarding_status exists, create if missing
  INSERT INTO onboarding_status (user_id, last_step, dog_submitted, human_submitted, photos_submitted, preferences_submitted)
  VALUES (user_id_val, 'pack', false, false, false, false)
  ON CONFLICT (user_id) DO NOTHING;

  -- Return minimal data needed for routing and initial rendering
  SELECT json_build_object(
    'onboarding', (
      SELECT json_build_object(
        'last_step', COALESCE(os.last_step, 'pack'),
        'dog_submitted', COALESCE(os.dog_submitted, false),
        'human_submitted', COALESCE(os.human_submitted, false),
        'photos_submitted', COALESCE(os.photos_submitted, false),
        'preferences_submitted', COALESCE(os.preferences_submitted, false)
      )
      FROM onboarding_status os
      WHERE os.user_id = user_id_val
      LIMIT 1
    ),
    'profile', (
      SELECT json_build_object(
        'lifecycle_status', COALESCE(p.lifecycle_status, 'onboarding'),
        'validation_status', COALESCE(p.validation_status, 'not_started'),
        'deleted_at', p.deleted_at
      )
      FROM profiles p
      WHERE p.user_id = user_id_val
      LIMIT 1
    ),
    'dogs', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'slot', d.slot,
          'name', d.name,
          'is_active', d.is_active
        )
        ORDER BY d.slot
      ), '[]'::json)
      FROM dogs d
      WHERE d.user_id = user_id_val
        AND d.is_active = true
    ),
    'preferences', (
      SELECT json_build_object(
        'pals_enabled', COALESCE(pref.pals_enabled, false),
        'match_enabled', COALESCE(pref.match_enabled, false)
      )
      FROM preferences pref
      WHERE pref.user_id = user_id_val
      LIMIT 1
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION load_me() TO authenticated;

