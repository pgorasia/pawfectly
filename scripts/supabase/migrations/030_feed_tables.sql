create table if not exists public.swipes (
  id bigserial primary key,
  viewer_id uuid not null,
  candidate_id uuid not null,
  action text not null check (action in ('reject','pass','accept')),
  created_at timestamptz not null default now(),
  unique (viewer_id, candidate_id)
);

create index if not exists idx_swipes_viewer_created
  on public.swipes(viewer_id, created_at desc);

create index if not exists idx_swipes_viewer_candidate
  on public.swipes(viewer_id, candidate_id);

create index if not exists idx_swipes_candidate_accept
  on public.swipes(candidate_id, created_at desc)
  where action = 'accept';


create table if not exists public.user_entitlements (
  user_id uuid primary key,
  tier text not null default 'free' check (tier in ('free','plus')),
  likes_per_day int null, -- null = unlimited
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_usage (
  user_id uuid not null,
  day_utc date not null,
  likes_used int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day_utc)
);

create index if not exists idx_daily_usage_user_day
  on public.daily_usage(user_id, day_utc);


create or replace function public.get_feed_basic(
  p_viewer_id uuid,
  p_limit int default 20
)
returns table(
  candidate_id uuid,
  human_name text,
  city text,
  dog_name text
)
language sql
stable
security definer
as $$
with candidates as (
  select p.user_id, p.display_name, p.city
  from public.profiles p
  where p.user_id <> p_viewer_id
    and p.lifecycle_status in ('active', 'limited')
    and not exists (
      select 1
      from public.swipes s
      where s.viewer_id = p_viewer_id
        and s.candidate_id = p.user_id
        and (
          s.action in ('reject','accept')
          or (s.action = 'pass' and s.created_at >= now() - interval '24 hours')
        )
    )
  order by p.updated_at desc nulls last
  limit p_limit
),
primary_dog as (
  select
    d.user_id,
    (array_agg(d.name order by d.slot))[1] as dog_name
  from public.dogs d
  where d.is_active = true
  group by d.user_id
)
select
  c.user_id as candidate_id,
  c.display_name as human_name,
  c.city,
  coalesce(pd.dog_name, '') as dog_name
from candidates c
left join primary_dog pd on pd.user_id = c.user_id;
$$;

alter function public.get_feed_basic(uuid, int) set search_path = public, pg_temp;
grant execute on function public.get_feed_basic(uuid, int) to authenticated;


create or replace function public.submit_swipe(
  p_viewer_id uuid,
  p_candidate_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_limit int;
  v_day date;
  v_used int;
begin
  if p_action not in ('reject','pass','accept') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  if p_viewer_id = p_candidate_id then
    return jsonb_build_object('ok', false, 'error', 'invalid_candidate');
  end if;

  -- Prevent concurrency issues for accept spam
  perform pg_advisory_xact_lock(hashtext(p_viewer_id::text));

  v_day := (now() at time zone 'utc')::date;

  -- Load entitlement (lazy create if missing)
  insert into public.user_entitlements(user_id)
  values (p_viewer_id)
  on conflict (user_id) do nothing;

  select likes_per_day into v_limit
  from public.user_entitlements
  where user_id = p_viewer_id;

  -- If accept, enforce limit (NULL = unlimited)
  if p_action = 'accept' and v_limit is not null then
    insert into public.daily_usage(user_id, day_utc, likes_used)
    values (p_viewer_id, v_day, 0)
    on conflict (user_id, day_utc) do nothing;

    select likes_used into v_used
    from public.daily_usage
    where user_id = p_viewer_id and day_utc = v_day;

    if v_used >= v_limit then
      return jsonb_build_object(
        'ok', false,
        'error', 'daily_limit_reached',
        'limit', v_limit,
        'used', v_used
      );
    end if;

    update public.daily_usage
    set likes_used = likes_used + 1,
        updated_at = now()
    where user_id = p_viewer_id and day_utc = v_day;

    v_used := v_used + 1;
  else
    -- for non-accept, still compute current used for UI
    select coalesce(du.likes_used, 0) into v_used
    from public.daily_usage du
    where du.user_id = p_viewer_id and du.day_utc = v_day;
  end if;

  -- Idempotent upsert
  insert into public.swipes(viewer_id, candidate_id, action)
  values (p_viewer_id, p_candidate_id, p_action)
  on conflict (viewer_id, candidate_id)
  do update set action = excluded.action, created_at = now();

  return jsonb_build_object(
    'ok', true,
    'remaining_accepts',
      case
        when v_limit is null then null
        else greatest(v_limit - v_used, 0)
      end
  );
end;
$$;

alter function public.submit_swipe(uuid, uuid, text) set search_path = public, pg_temp;
grant execute on function public.submit_swipe(uuid, uuid, text) to authenticated;
