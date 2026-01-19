-- ============================================================================
-- Migration: Messages thumbnails use same photo logic as celebration
--
-- Goal:
-- - Add `thumb_storage_path` to `get_messages_home` payloads (matches/threads/sent_requests)
-- - `thumb_storage_path` selection:
--   - Prefer the hero photo *if* that hero photo is from the human bucket
--   - Else use the earliest approved human photo (contains_human = true)
--   - Else fall back to the existing approved hero photo storage_path
--
-- Notes:
-- - Backward-compatible: keeps `hero_storage_path` unchanged.
-- - Based on the latest `get_messages_home` SQL provided (>= 068).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_messages_home(p_limit int)
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

  WITH
  -- ---------------- MUTUAL CONNECTIONS (MATCH PRIORITY) ----------------
  mutual_match AS (
    SELECT
      s1.candidate_id AS other_id,
      'match'::text AS lane,
      GREATEST(s1.created_at, s2.created_at) AS connected_at
    FROM public.swipes s1
    JOIN public.swipes s2
      ON s2.viewer_id = s1.candidate_id
     AND s2.candidate_id = s1.viewer_id
     AND s2.lane = 'match'
    WHERE s1.viewer_id = v_me
      AND s1.lane = 'match'
      AND s1.action = 'accept'
      AND s2.action = 'accept'
  ),
  mutual_pals AS (
    SELECT
      s1.candidate_id AS other_id,
      'pals'::text AS lane,
      GREATEST(s1.created_at, s2.created_at) AS connected_at
    FROM public.swipes s1
    JOIN public.swipes s2
      ON s2.viewer_id = s1.candidate_id
     AND s2.candidate_id = s1.viewer_id
     AND s2.lane = 'pals'
    WHERE s1.viewer_id = v_me
      AND s1.lane = 'pals'
      AND s1.action = 'accept'
      AND s2.action = 'accept'
  ),
  mutual AS (
    SELECT * FROM mutual_match
    UNION ALL
    SELECT p.*
    FROM mutual_pals p
    WHERE NOT EXISTS (SELECT 1 FROM mutual_match m WHERE m.other_id = p.other_id)
  ),
  mutual_no_convo AS (
    SELECT m.*
    FROM mutual m
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants a
      JOIN public.conversation_participants b
        ON b.conversation_id = a.conversation_id
      WHERE a.user_id = v_me
        AND b.user_id = m.other_id
        AND a.removed_at IS NULL  -- Only exclude if user hasn't removed the conversation
    )
  ),

  -- ---------------- CROSS-LANE PENDING (CHOOSER ONLY) ----------------
  cross_lane_pending AS (
    SELECT
      cl.match_user_id AS other_id,
      'pals'::text AS lane,                 -- Keep lane stable for filters; badge_lane drives the '?' UI
      cl.created_at AS connected_at,
      'unknown'::text AS badge_lane,
      true AS requires_lane_choice,
      cl.expires_at AS expires_at
    FROM public.cross_lane_connections cl
    WHERE cl.status = 'pending'
      AND cl.pals_user_id = v_me
  ),

  matches_union AS (
    SELECT
      mn.other_id,
      mn.lane,
      mn.connected_at,
      mn.lane::text AS badge_lane,
      false AS requires_lane_choice,
      NULL::timestamptz AS expires_at
    FROM mutual_no_convo mn
    UNION ALL
    SELECT
      p.other_id,
      p.lane,
      p.connected_at,
      p.badge_lane,
      p.requires_lane_choice,
      p.expires_at
    FROM cross_lane_pending p
  ),

  -- ---------------- LIKED YOU COUNT (FOR MESSAGE CARD) ----------------
  liked_you_visible AS (
    SELECT DISTINCT s.viewer_id
    FROM public.swipes s
    JOIN public.profiles p
      ON p.user_id = s.viewer_id
    LEFT JOIN public.blocked_users bu_blocked_by_me
      ON bu_blocked_by_me.blocker_id = v_me
     AND bu_blocked_by_me.blocked_id = s.viewer_id
    LEFT JOIN public.blocked_users bu_blocked_me
      ON bu_blocked_me.blocker_id = s.viewer_id
     AND bu_blocked_me.blocked_id = v_me
    WHERE s.candidate_id = v_me
      AND s.action = 'accept'
      AND p.lifecycle_status IN ('active', 'limited')
      AND COALESCE(p.is_hidden, false) = false
      AND p.deleted_at IS NULL
      AND bu_blocked_by_me.id IS NULL
      AND bu_blocked_me.id IS NULL

      -- Exclude anyone I've already hard-acted on (accept/reject) in any lane
      AND NOT EXISTS (
        SELECT 1
        FROM public.swipes my
        WHERE my.viewer_id = v_me
          AND my.candidate_id = s.viewer_id
          AND my.action IN ('accept','reject')
      )

      -- Exclude only hard suppressions (reject/cross-lane cooldown), but NOT skip
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_suppressions us
        WHERE us.actor_id = v_me
          AND us.target_id = s.viewer_id
          AND (
            us.blocked_at IS NOT NULL
            OR us.reported_at IS NOT NULL
            OR us.match_pass_until > now()
            OR us.match_pass_until = 'infinity'::timestamptz
          )
      )
  ),

  best_dog AS (
    SELECT
      d.user_id,
      MIN(d.slot) AS best_slot,
      (array_agg(d.name ORDER BY d.slot))[1] AS dog_name
    FROM public.dogs d
    WHERE d.is_active = true
    GROUP BY d.user_id
  ),

  matches_rows AS (
    SELECT
      mu.other_id,
      mu.lane,
      mu.connected_at,
      mu.badge_lane,
      mu.requires_lane_choice,
      mu.expires_at,
      p.display_name,
      COALESCE(bd.dog_name, '') AS dog_name,
      hp.storage_path AS hero_storage_path,
      COALESCE(
        CASE WHEN hp.bucket_type = 'human' THEN hp.storage_path END,
        human.storage_path,
        hp.storage_path
      ) AS thumb_storage_path
    FROM matches_union mu
    JOIN public.profiles p ON p.user_id = mu.other_id
    LEFT JOIN best_dog bd ON bd.user_id = mu.other_id
    LEFT JOIN LATERAL public.pick_hero_photo(mu.other_id, v_me, bd.best_slot) hp ON TRUE
    LEFT JOIN LATERAL (
      SELECT ph.storage_path
      FROM public.photos ph
      WHERE ph.user_id = mu.other_id
        AND ph.status = 'approved'
        AND ph.contains_human = true
      ORDER BY ph.created_at ASC
      LIMIT 1
    ) human ON TRUE
    ORDER BY mu.connected_at DESC
    LIMIT p_limit
  ),

  -- ---------------- SENT REQUESTS (CONVERSATIONS + CROSS-LANE PENDING) ----------------
  sent_requests_conversations AS (
    SELECT
      c.id::text AS conversation_id,
      c.lane,
      c.created_at,
      c.last_message_text AS preview,
      false AS is_cross_lane_pending,
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
    LEFT JOIN best_dog bd ON bd.user_id = other.user_id
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
      AND c.requested_by = v_me
      AND mep.removed_at IS NULL
  ),
  sent_requests_cross_lane AS (
    SELECT
      ('cross_lane_pending:' || (CASE WHEN cl.pals_user_id = v_me THEN cl.match_user_id ELSE cl.pals_user_id END)::text) AS conversation_id,
      COALESCE(cl.message_lane, 'match') AS lane,
      COALESCE(cl.message_created_at, cl.created_at) AS created_at,
      cl.message_body AS preview,
      true AS is_cross_lane_pending,
      (CASE WHEN cl.pals_user_id = v_me THEN cl.match_user_id ELSE cl.pals_user_id END) AS other_id,
      p.display_name,
      COALESCE(bd.dog_name, '') AS dog_name,
      hp.storage_path AS hero_storage_path,
      COALESCE(
        CASE WHEN hp.bucket_type = 'human' THEN hp.storage_path END,
        human.storage_path,
        hp.storage_path
      ) AS thumb_storage_path
    FROM public.cross_lane_connections cl
    JOIN public.profiles p
      ON p.user_id = (CASE WHEN cl.pals_user_id = v_me THEN cl.match_user_id ELSE cl.pals_user_id END)
    LEFT JOIN best_dog bd ON bd.user_id = p.user_id
    LEFT JOIN LATERAL public.pick_hero_photo(p.user_id, v_me, bd.best_slot) hp ON TRUE
    LEFT JOIN LATERAL (
      SELECT ph.storage_path
      FROM public.photos ph
      WHERE ph.user_id = p.user_id
        AND ph.status = 'approved'
        AND ph.contains_human = true
      ORDER BY ph.created_at ASC
      LIMIT 1
    ) human ON TRUE
    WHERE cl.status = 'pending'
      AND cl.message_sender_id = v_me
      AND cl.message_body IS NOT NULL
  ),
  sent_requests AS (
    SELECT * FROM sent_requests_conversations
    UNION ALL
    SELECT * FROM sent_requests_cross_lane
    ORDER BY created_at DESC
    LIMIT p_limit
  ),

  -- ---------------- ACTIVE THREADS ----------------
  threads AS (
    SELECT
      c.id AS conversation_id,
      c.lane,
      c.last_message_at,
      c.last_message_text AS preview,
      other.user_id AS other_id,
      p.display_name,
      COALESCE(bd.dog_name, '') AS dog_name,
      hp.storage_path AS hero_storage_path,
      COALESCE(
        CASE WHEN hp.bucket_type = 'human' THEN hp.storage_path END,
        human.storage_path,
        hp.storage_path
      ) AS thumb_storage_path,
      mep.last_read_at
    FROM public.conversations c
    JOIN public.conversation_participants mep
      ON mep.conversation_id = c.id AND mep.user_id = v_me
    JOIN public.conversation_participants other
      ON other.conversation_id = c.id AND other.user_id <> v_me
    JOIN public.profiles p
      ON p.user_id = other.user_id
    LEFT JOIN best_dog bd ON bd.user_id = other.user_id
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
    WHERE c.status = 'active'
      AND mep.removed_at IS NULL  -- Filter out conversations where user has removed_at
    ORDER BY COALESCE(c.last_message_at, c.updated_at, c.created_at) DESC
    LIMIT p_limit
  ),

  threads_with_unread AS (
    SELECT
      t.*,
      (
        SELECT count(*)
        FROM public.conversation_messages m
        WHERE m.conversation_id = t.conversation_id
          AND m.sender_id <> v_me
          AND (t.last_read_at IS NULL OR m.created_at > t.last_read_at)
      ) AS unread_count
    FROM threads t
  )

  SELECT jsonb_build_object(
    'matches',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'user_id', other_id,
          'lane', lane,
          'badge_lane', badge_lane,
          'requires_lane_choice', requires_lane_choice,
          'expires_at', expires_at,
          'connected_at', connected_at,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path,
          'thumb_storage_path', thumb_storage_path
        ) ORDER BY connected_at DESC) FROM matches_rows),
        '[]'::jsonb
      ),

    'sent_requests',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'conversation_id', conversation_id,
          'user_id', other_id,
          'lane', lane,
          'created_at', created_at,
          'preview', preview,
          'is_cross_lane_pending', is_cross_lane_pending,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path,
          'thumb_storage_path', thumb_storage_path
        ) ORDER BY created_at DESC) FROM sent_requests),
        '[]'::jsonb
      ),

    'threads',
      COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
          'conversation_id', conversation_id,
          'user_id', other_id,
          'lane', lane,
          'last_message_at', last_message_at,
          'preview', preview,
          'unread_count', unread_count,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path,
          'thumb_storage_path', thumb_storage_path
        ) ORDER BY COALESCE(last_message_at, now()) DESC) FROM threads_with_unread),
        '[]'::jsonb
      ),

    'liked_you_count', (SELECT count(*) FROM liked_you_visible)
  )
  INTO v_out;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_messages_home(int) TO authenticated;

