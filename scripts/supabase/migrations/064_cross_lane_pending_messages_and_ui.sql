-- ============================================================================
-- Migration: Persist cross-lane pending chat request message
--
-- Problem:
-- - send_chat_request currently refuses to create a conversation when a cross-lane
--   pending connection exists, and it also discards the compliment message.
-- - This prevents the sender from seeing their sent request in Messages > Requests > Sent,
--   and causes the compliment history to be lost when the chooser resolves the lane.
--
-- Solution:
-- - Store the initial chat request message on cross_lane_connections while pending.
-- - Include cross-lane pending "sent requests" in get_messages_home for the sender.
-- - Expose an RPC to fetch the pending details for a dedicated cross-lane UI screen.
-- - When resolved, migrate the stored message into the created conversation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema: store the pending chat request message on cross_lane_connections
-- ---------------------------------------------------------------------------

ALTER TABLE public.cross_lane_connections
  ADD COLUMN IF NOT EXISTS message_body text,
  ADD COLUMN IF NOT EXISTS message_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS message_sender_id uuid,
  ADD COLUMN IF NOT EXISTS message_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS message_client_message_id uuid,
  ADD COLUMN IF NOT EXISTS message_lane text CHECK (message_lane IN ('pals','match'));

-- Idempotency guard for client retries.
CREATE UNIQUE INDEX IF NOT EXISTS cross_lane_connections_message_client_id_uq
  ON public.cross_lane_connections (message_client_message_id)
  WHERE message_client_message_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 2) send_chat_request: if cross-lane pending exists, persist message + return ok
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_chat_request(
  p_target_id uuid,
  p_lane text,
  p_body text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_client_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_convo_id uuid;
  v_like jsonb;
  v_low uuid;
  v_high uuid;
  v_is_mutual_like boolean := false;
  v_conversation_status text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_target_id IS NULL OR p_target_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  IF p_lane NOT IN ('pals','match') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lane');
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_message');
  END IF;

  IF p_client_message_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_client_message_id');
  END IF;

  -- Check if there's already a mutual like (target has accepted v_me in the same lane)
  SELECT EXISTS (
    SELECT 1
    FROM public.swipes s
    WHERE s.viewer_id = p_target_id
      AND s.candidate_id = v_me
      AND s.lane = p_lane
      AND s.action = 'accept'
  ) INTO v_is_mutual_like;

  -- Like = counts toward like limit (per your rule)
  v_like := public.submit_swipe(p_target_id, 'accept', p_lane);
  IF COALESCE((v_like->>'ok')::boolean, false) = false THEN
    RETURN v_like;
  END IF;

  v_low  := LEAST(v_me, p_target_id);
  v_high := GREATEST(v_me, p_target_id);

  -- Cross-lane mutual formed in a different lane: submit_swipe will have created a
  -- pending cross_lane_connections row. Do not create a conversation yet, but DO
  -- persist the message so the sender can see it and it can be migrated on resolve.
  IF EXISTS (
    SELECT 1
    FROM public.cross_lane_connections c
    WHERE c.user_low = v_low
      AND c.user_high = v_high
      AND c.status = 'pending'
  ) THEN
    UPDATE public.cross_lane_connections c
    SET
      message_body = COALESCE(c.message_body, p_body),
      message_metadata = CASE
        WHEN c.message_body IS NULL THEN COALESCE(p_metadata,'{}'::jsonb)
        ELSE c.message_metadata
      END,
      message_sender_id = COALESCE(c.message_sender_id, v_me),
      message_created_at = COALESCE(c.message_created_at, now()),
      message_client_message_id = COALESCE(c.message_client_message_id, p_client_message_id),
      message_lane = COALESCE(c.message_lane, p_lane)
    WHERE c.user_low = v_low
      AND c.user_high = v_high
      AND c.status = 'pending'
      AND (c.message_client_message_id IS NULL OR c.message_client_message_id = p_client_message_id);

    RETURN jsonb_build_object(
      'ok', true,
      'cross_lane_pending', true,
      'remaining_accepts', v_like->'remaining_accepts'
    );
  END IF;

  -- Determine conversation status:
  -- - If mutual like exists (target already liked v_me), status = 'active'
  -- - Otherwise, status = 'request'
  v_conversation_status := CASE
    WHEN v_is_mutual_like THEN 'active'
    ELSE 'request'
  END;

  -- Upsert conversation using explicit constraint
  INSERT INTO public.conversations(user_low, user_high, lane, status, requested_by, created_at, updated_at)
  VALUES (v_low, v_high, p_lane, v_conversation_status, v_me, now(), now())
  ON CONFLICT (user_low, user_high)
  DO UPDATE SET
    status = CASE
      WHEN public.conversations.status = 'active' THEN public.conversations.status
      WHEN v_is_mutual_like THEN 'active'  -- Upgrade to active if mutual like
      ELSE COALESCE(public.conversations.status, 'request')
    END,
    lane = CASE
      WHEN public.conversations.status = 'active' THEN public.conversations.lane
      ELSE EXCLUDED.lane
    END,
    requested_by = CASE
      WHEN public.conversations.status = 'request'
        THEN COALESCE(public.conversations.requested_by, EXCLUDED.requested_by)
      WHEN public.conversations.status = 'active'
        THEN public.conversations.requested_by
      ELSE EXCLUDED.requested_by
    END,
    updated_at = now()
  RETURNING id INTO v_convo_id;

  -- Participants (requires PK/unique on (conversation_id, user_id))
  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, v_me)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, p_target_id)
  ON CONFLICT DO NOTHING;

  -- Insert message idempotently; only update conversation last_message_* if insert succeeded
  WITH ins AS (
    INSERT INTO public.conversation_messages(conversation_id, sender_id, kind, body, metadata, client_message_id)
    VALUES (v_convo_id, v_me, 'compliment', p_body, COALESCE(p_metadata,'{}'::jsonb), p_client_message_id)
    ON CONFLICT ON CONSTRAINT conversation_messages_client_message_id_key DO NOTHING
    RETURNING sender_id, kind, body, created_at
  )
  UPDATE public.conversations c
  SET last_message_at = ins.created_at,
      last_sender_id = ins.sender_id,
      last_message_kind = ins.kind,
      last_message_text = ins.body,
      last_message_preview = left(ins.body, 140),
      updated_at = now()
  FROM ins
  WHERE c.id = v_convo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_convo_id,
    'remaining_accepts', v_like->'remaining_accepts'
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 3) resolve_cross_lane_connection: migrate pending message into conversation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_cross_lane_connection(
  p_other_id uuid,
  p_selected_lane text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_row public.cross_lane_connections%rowtype;
  v_convo_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_other_id IS NULL OR p_other_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  IF p_selected_lane NOT IN ('pals','match') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lane');
  END IF;

  v_low := LEAST(v_me, p_other_id);
  v_high := GREATEST(v_me, p_other_id);

  SELECT * INTO v_row
  FROM public.cross_lane_connections c
  WHERE c.user_low = v_low
    AND c.user_high = v_high
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status <> 'pending' OR v_row.resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_resolved', 'lane', v_row.resolved_lane);
  END IF;

  IF v_me <> v_row.pals_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.cross_lane_connections
  SET status = 'resolved',
      resolved_lane = p_selected_lane,
      resolved_at = now(),
      resolved_by = v_me
  WHERE user_low = v_low
    AND user_high = v_high;

  -- Ensure both accepts exist in the resolved lane (NO quota burn).
  IF p_selected_lane = 'match' THEN
    INSERT INTO public.swipes(viewer_id, candidate_id, lane, action, created_at)
    VALUES (v_row.pals_user_id, v_row.match_user_id, 'match', 'accept', now())
    ON CONFLICT (viewer_id, candidate_id, lane)
    DO UPDATE SET action = 'accept', created_at = now();
  ELSE
    INSERT INTO public.swipes(viewer_id, candidate_id, lane, action, created_at)
    VALUES (v_row.match_user_id, v_row.pals_user_id, 'pals', 'accept', now())
    ON CONFLICT (viewer_id, candidate_id, lane)
    DO UPDATE SET action = 'accept', created_at = now();
  END IF;

  -- Create/upgrade conversation to ACTIVE in the resolved lane.
  INSERT INTO public.conversations(user_low, user_high, lane, status, requested_by, created_at, updated_at)
  VALUES (v_low, v_high, p_selected_lane, 'active', NULL, now(), now())
  ON CONFLICT (user_low, user_high)
  DO UPDATE SET
    status = 'active',
    requested_by = NULL,
    lane = EXCLUDED.lane,
    updated_at = now()
  RETURNING id INTO v_convo_id;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, v_row.pals_user_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.conversation_participants(conversation_id, user_id)
  VALUES (v_convo_id, v_row.match_user_id)
  ON CONFLICT DO NOTHING;

  -- Migrate stored pending message into the created conversation (if any).
  IF v_row.message_body IS NOT NULL
     AND v_row.message_sender_id IS NOT NULL
     AND v_row.message_client_message_id IS NOT NULL THEN
    WITH ins AS (
      INSERT INTO public.conversation_messages(conversation_id, sender_id, kind, body, metadata, client_message_id)
      VALUES (
        v_convo_id,
        v_row.message_sender_id,
        'compliment',
        v_row.message_body,
        COALESCE(v_row.message_metadata,'{}'::jsonb),
        v_row.message_client_message_id
      )
      ON CONFLICT ON CONSTRAINT conversation_messages_client_message_id_key DO NOTHING
      RETURNING sender_id, kind, body, created_at
    )
    UPDATE public.conversations c
    SET last_message_at = ins.created_at,
        last_sender_id = ins.sender_id,
        last_message_kind = ins.kind,
        last_message_text = ins.body,
        last_message_preview = left(ins.body, 140),
        updated_at = now()
    FROM ins
    WHERE c.id = v_convo_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'conversation_id', v_convo_id,
    'lane', p_selected_lane
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 4) RPC: get_cross_lane_pending(p_other_id) for cross-lane chat UI
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_cross_lane_pending(p_other_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_row public.cross_lane_connections%rowtype;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_other_id IS NULL OR p_other_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  v_low := LEAST(v_me, p_other_id);
  v_high := GREATEST(v_me, p_other_id);

  SELECT * INTO v_row
  FROM public.cross_lane_connections c
  WHERE c.user_low = v_low
    AND c.user_high = v_high;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_row.status, 'lane', v_row.resolved_lane);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'pals_user_id', v_row.pals_user_id,
    'match_user_id', v_row.match_user_id,
    'created_at', v_row.created_at,
    'expires_at', v_row.expires_at,
    'is_chooser', (v_me = v_row.pals_user_id),
    'message',
      CASE
        WHEN v_row.message_body IS NULL THEN NULL
        ELSE jsonb_build_object(
          'sender_id', v_row.message_sender_id,
          'body', v_row.message_body,
          'metadata', COALESCE(v_row.message_metadata,'{}'::jsonb),
          'created_at', COALESCE(v_row.message_created_at, v_row.created_at),
          'client_message_id', v_row.message_client_message_id,
          'lane', v_row.message_lane
        )
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cross_lane_pending(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- 5) get_messages_home: include cross-lane pending as sent_requests for sender
-- ---------------------------------------------------------------------------
-- Note: we override only the sent_requests CTE + output to include an additional
--       boolean discriminator so clients can route to the cross-lane screen.

CREATE OR REPLACE FUNCTION public.get_messages_home(p_limit int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_me uuid := auth.uid();
  v_out jsonb;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  with
  -- ---------------- MUTUAL CONNECTIONS (MATCH PRIORITY) ----------------
  mutual_match as (
    select
      s1.candidate_id as other_id,
      'match'::text as lane,
      greatest(s1.created_at, s2.created_at) as connected_at
    from public.swipes s1
    join public.swipes s2
      on s2.viewer_id = s1.candidate_id
     and s2.candidate_id = s1.viewer_id
     and s2.lane = 'match'
    where s1.viewer_id = v_me
      and s1.lane = 'match'
      and s1.action = 'accept'
      and s2.action = 'accept'
  ),
  mutual_pals as (
    select
      s1.candidate_id as other_id,
      'pals'::text as lane,
      greatest(s1.created_at, s2.created_at) as connected_at
    from public.swipes s1
    join public.swipes s2
      on s2.viewer_id = s1.candidate_id
     and s2.candidate_id = s1.viewer_id
     and s2.lane = 'pals'
    where s1.viewer_id = v_me
      and s1.lane = 'pals'
      and s1.action = 'accept'
      and s2.action = 'accept'
  ),
  mutual as (
    select * from mutual_match
    union all
    select p.*
    from mutual_pals p
    where not exists (select 1 from mutual_match m where m.other_id = p.other_id)
  ),
  mutual_no_convo as (
    select m.*
    from mutual m
    where not exists (
      select 1
      from public.conversation_participants a
      join public.conversation_participants b
        on b.conversation_id = a.conversation_id
      where a.user_id = v_me
        and b.user_id = m.other_id
        and a.removed_at is null  -- Only exclude if user hasn't removed the conversation
    )
  ),

  -- ---------------- CROSS-LANE PENDING (CHOOSER ONLY) ----------------
  cross_lane_pending as (
    select
      cl.match_user_id as other_id,
      'pals'::text as lane,                 -- Keep lane stable for filters; badge_lane drives the '?' UI
      cl.created_at as connected_at,
      'unknown'::text as badge_lane,
      true as requires_lane_choice,
      cl.expires_at as expires_at
    from public.cross_lane_connections cl
    where cl.status = 'pending'
      and cl.pals_user_id = v_me
  ),

  matches_union as (
    select
      mn.other_id,
      mn.lane,
      mn.connected_at,
      mn.lane::text as badge_lane,
      false as requires_lane_choice,
      null::timestamptz as expires_at
    from mutual_no_convo mn
    union all
    select
      p.other_id,
      p.lane,
      p.connected_at,
      p.badge_lane,
      p.requires_lane_choice,
      p.expires_at
    from cross_lane_pending p
  ),

  -- ---------------- LIKED YOU COUNT (FOR MESSAGE CARD) ----------------
  liked_you_visible as (
	  select distinct s.viewer_id
	  from public.swipes s
	  join public.profiles p
		on p.user_id = s.viewer_id
	  left join public.blocked_users bu_blocked_by_me
		on bu_blocked_by_me.blocker_id = v_me
	   and bu_blocked_by_me.blocked_id = s.viewer_id
	  left join public.blocked_users bu_blocked_me
		on bu_blocked_me.blocker_id = s.viewer_id
	   and bu_blocked_me.blocked_id = v_me
	  where s.candidate_id = v_me
		and s.action = 'accept'
		and p.lifecycle_status in ('active', 'limited')
		and coalesce(p.is_hidden, false) = false
		and p.deleted_at is null
		and bu_blocked_by_me.id is null
		and bu_blocked_me.id is null

		-- Exclude anyone I've already hard-acted on (accept/reject) in any lane
		and not exists (
		  select 1
		  from public.swipes my
		  where my.viewer_id = v_me
			and my.candidate_id = s.viewer_id
			and my.action in ('accept','reject')
		)

		-- Exclude only hard suppressions (reject/cross-lane cooldown), but NOT skip
		and not exists (
		  select 1
		  from public.user_suppressions us
		  where us.actor_id = v_me
			and us.target_id = s.viewer_id
			and (
			  us.blocked_at is not null
			  or us.reported_at is not null
			  or us.match_pass_until > now()
			  or us.match_pass_until = 'infinity'::timestamptz
			)
		)
  ),

  best_dog as (
    select d.user_id,
           min(d.slot) as best_slot,
           (array_agg(d.name order by d.slot))[1] as dog_name
    from public.dogs d
    where d.is_active = true
    group by d.user_id
  ),

  matches_rows as (
    select
      mu.other_id,
      mu.lane,
      mu.connected_at,
      mu.badge_lane,
      mu.requires_lane_choice,
      mu.expires_at,
      p.display_name,
      coalesce(bd.dog_name, '') as dog_name,
      hp.storage_path as hero_storage_path
    from matches_union mu
    join public.profiles p on p.user_id = mu.other_id
    left join best_dog bd on bd.user_id = mu.other_id
    left join lateral public.pick_hero_photo(mu.other_id, v_me, bd.best_slot) hp on true
    order by mu.connected_at desc
    limit p_limit
  ),

  -- ---------------- SENT REQUESTS (CONVERSATIONS + CROSS-LANE PENDING) ----------------
  sent_requests_conversations as (
    select
      c.id::text as conversation_id,
      c.lane,
      c.created_at,
      c.last_message_text as preview,
      false as is_cross_lane_pending,
      other.user_id as other_id,
      p.display_name,
      coalesce(bd.dog_name, '') as dog_name,
      hp.storage_path as hero_storage_path
    from public.conversations c
    join public.conversation_participants mep
      on mep.conversation_id = c.id and mep.user_id = v_me
    join public.conversation_participants other
      on other.conversation_id = c.id and other.user_id <> v_me
    join public.profiles p
      on p.user_id = other.user_id
    left join best_dog bd on bd.user_id = other.user_id
    left join lateral public.pick_hero_photo(other.user_id, v_me, bd.best_slot) hp on true
    where c.status = 'request'
      and c.requested_by = v_me
      and mep.removed_at is null
  ),
  sent_requests_cross_lane as (
    select
      ('cross_lane_pending:' || (case when cl.pals_user_id = v_me then cl.match_user_id else cl.pals_user_id end)::text) as conversation_id,
      COALESCE(cl.message_lane, 'match') as lane,
      COALESCE(cl.message_created_at, cl.created_at) as created_at,
      cl.message_body as preview,
      true as is_cross_lane_pending,
      (case when cl.pals_user_id = v_me then cl.match_user_id else cl.pals_user_id end) as other_id,
      p.display_name,
      coalesce(bd.dog_name, '') as dog_name,
      hp.storage_path as hero_storage_path
    from public.cross_lane_connections cl
    join public.profiles p
      on p.user_id = (case when cl.pals_user_id = v_me then cl.match_user_id else cl.pals_user_id end)
    left join best_dog bd on bd.user_id = p.user_id
    left join lateral public.pick_hero_photo(p.user_id, v_me, bd.best_slot) hp on true
    where cl.status = 'pending'
      and cl.message_sender_id = v_me
      and cl.message_body is not null
  ),
  sent_requests as (
    select * from sent_requests_conversations
    union all
    select * from sent_requests_cross_lane
    order by created_at desc
    limit p_limit
  ),

  -- ---------------- ACTIVE THREADS ----------------
  threads as (
    select
      c.id as conversation_id,
      c.lane,
      c.last_message_at,
      c.last_message_text as preview,
      other.user_id as other_id,
      p.display_name,
      coalesce(bd.dog_name, '') as dog_name,
      hp.storage_path as hero_storage_path,
      mep.last_read_at
    from public.conversations c
    join public.conversation_participants mep
      on mep.conversation_id = c.id and mep.user_id = v_me
    join public.conversation_participants other
      on other.conversation_id = c.id and other.user_id <> v_me
    join public.profiles p
      on p.user_id = other.user_id
    left join best_dog bd on bd.user_id = other.user_id
    left join lateral public.pick_hero_photo(other.user_id, v_me, bd.best_slot) hp on true
    where c.status = 'active'
      and mep.removed_at is null  -- Filter out conversations where user has removed_at
    order by coalesce(c.last_message_at, c.updated_at, c.created_at) desc
    limit p_limit
  ),

  threads_with_unread as (
    select
      t.*,
      (
        select count(*)
        from public.conversation_messages m
        where m.conversation_id = t.conversation_id
          and m.sender_id <> v_me
          and (t.last_read_at is null or m.created_at > t.last_read_at)
      ) as unread_count
    from threads t
  )

  select jsonb_build_object(
    'matches',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'user_id', other_id,
          'lane', lane,
          'badge_lane', badge_lane,
          'requires_lane_choice', requires_lane_choice,
          'expires_at', expires_at,
          'connected_at', connected_at,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path
        ) order by connected_at desc) from matches_rows),
        '[]'::jsonb
      ),

    'sent_requests',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'conversation_id', conversation_id,
          'user_id', other_id,
          'lane', lane,
          'created_at', created_at,
          'preview', preview,
          'is_cross_lane_pending', is_cross_lane_pending,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path
        ) order by created_at desc) from sent_requests),
        '[]'::jsonb
      ),

    'threads',
      coalesce(
        (select jsonb_agg(jsonb_build_object(
          'conversation_id', conversation_id,
          'user_id', other_id,
          'lane', lane,
          'last_message_at', last_message_at,
          'preview', preview,
          'unread_count', unread_count,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path
        ) order by coalesce(last_message_at, now()) desc) from threads_with_unread),
        '[]'::jsonb
      ),

    'liked_you_count', (select count(*) from liked_you_visible)
  )
  into v_out;

  return v_out;
end;
$$;

