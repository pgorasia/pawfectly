-- ============================================================================
-- Migration: Incoming request thumbnails use same photo logic as celebration
--
-- Goal:
-- - Add `thumb_storage_path` to `get_incoming_requests` payload.
-- - Selection matches `get_messages_home`:
--   - Prefer hero photo when hero bucket_type = 'human'
--   - Else earliest approved human photo
--   - Else fall back to approved hero photo storage_path
--
-- Notes:
-- - Backward-compatible: keeps `hero_storage_path` unchanged.
-- - Based on the latest `get_incoming_requests` SQL provided (>= 068).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_incoming_requests(p_limit int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  WITH best_dog AS (
    SELECT
      d.user_id,
      MIN(d.slot) AS best_slot,
      (array_agg(d.name ORDER BY d.slot))[1] AS dog_name
    FROM public.dogs d
    WHERE d.is_active = true
    GROUP BY d.user_id
  ),
  req AS (
    SELECT
      c.id AS conversation_id,
      c.lane,
      c.created_at,
      c.last_message_text AS preview,
      other.user_id AS other_id,
      p.display_name,
      COALESCE(bd.dog_name, '') AS dog_name,
      hp.storage_path AS hero_storage_path,
      COALESCE(
        CASE WHEN hp.bucket_type = 'human' THEN hp.storage_path END,
        human.storage_path,
        hp.storage_path
      ) AS thumb_storage_path
    FROM public.conversations c
    JOIN public.conversation_participants mep
      ON mep.conversation_id = c.id AND mep.user_id = v_me
    JOIN public.conversation_participants other
      ON other.conversation_id = c.id AND other.user_id <> v_me
    JOIN public.profiles p
      ON p.user_id = other.user_id
    LEFT JOIN best_dog bd
      ON bd.user_id = other.user_id
    LEFT JOIN LATERAL public.pick_hero_photo(other.user_id, v_me, bd.best_slot) hp ON TRUE
    LEFT JOIN LATERAL (
      SELECT ph.storage_path
      FROM public.photos ph
      WHERE ph.user_id = other.user_id
        AND ph.status = 'approved'
        AND ph.contains_human = true
      ORDER BY ph.created_at ASC
      LIMIT 1
    ) human ON TRUE
    WHERE c.status = 'request'
      AND c.requested_by <> v_me
      AND mep.removed_at IS NULL  -- Filter out conversations where user has removed_at
    ORDER BY c.created_at DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'requests',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'conversation_id', conversation_id,
          'user_id', other_id,
          'lane', lane,
          'created_at', created_at,
          'preview', preview,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path,
          'thumb_storage_path', thumb_storage_path
        )
        ORDER BY created_at DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_out
  FROM req;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_incoming_requests(int) TO authenticated;

