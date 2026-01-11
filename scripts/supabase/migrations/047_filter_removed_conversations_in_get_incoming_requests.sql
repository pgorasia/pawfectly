-- ============================================================================
-- Migration: Filter removed conversations in get_incoming_requests
-- Excludes conversations where the current user has removed_at IS NOT NULL
-- This ensures blocked/reported/unmatched requests don't appear after refresh
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_incoming_requests(p_limit int)
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

  with best_dog as (
    select d.user_id,
           min(d.slot) as best_slot,
           (array_agg(d.name order by d.slot))[1] as dog_name
    from public.dogs d
    where d.is_active = true
    group by d.user_id
  ),
  req as (
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
    left join best_dog bd
      on bd.user_id = other.user_id
    left join lateral public.pick_hero_photo(other.user_id, v_me, bd.best_slot) hp on true
    where c.status = 'request'
      and c.requested_by <> v_me
      and mep.removed_at is null  -- Filter out conversations where user has removed_at
    order by c.created_at desc
    limit p_limit
  )
  select jsonb_build_object(
    'requests',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'conversation_id', conversation_id,
          'user_id', other_id,
          'lane', lane,
          'created_at', created_at,
          'preview', preview,
          'display_name', display_name,
          'dog_name', dog_name,
          'hero_storage_path', hero_storage_path
        )
        order by created_at desc
      ),
      '[]'::jsonb
    )
  )
  into v_out
  from req;

  return v_out;
end;
$$;
