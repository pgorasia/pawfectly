-- ============================================================================
-- Migration: Include cross-lane pending connections in Messages > Matches row
--
-- Pending cross-lane connections are shown only to the pals_user_id in the
-- Messages tab under Matches, with badge_lane='unknown' (render '?') and
-- requires_lane_choice=true.
-- ============================================================================

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

  -- ---------------- SENT REQUESTS ----------------
  sent_requests as (
    select
      c.id as conversation_id,
      c.lane,
      c.created_at,
      c.last_message_text as preview,
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
      and mep.removed_at is null  -- Filter out conversations where user has removed_at
    order by c.created_at desc
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
