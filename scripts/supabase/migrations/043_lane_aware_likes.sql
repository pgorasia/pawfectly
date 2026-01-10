-- Migration: Make submit_swipe lane-aware
-- Add lane tracking to daily usage and update the RPC function signature

-- 1. Add lane column to daily_usage table
ALTER TABLE public.daily_usage 
  ADD COLUMN IF NOT EXISTS lane text CHECK (lane IN ('pals', 'match'));

-- 2. Create new composite primary key (user_id, day_utc, lane)
-- First drop the old constraint and recreate with lane
ALTER TABLE public.daily_usage DROP CONSTRAINT IF EXISTS daily_usage_pkey;
ALTER TABLE public.daily_usage 
  ADD CONSTRAINT daily_usage_pkey PRIMARY KEY (user_id, day_utc, lane);

-- 3. Migrate existing data to default 'match' lane
UPDATE public.daily_usage SET lane = 'match' WHERE lane IS NULL;

-- 4. Make lane column NOT NULL now that data is migrated
ALTER TABLE public.daily_usage ALTER COLUMN lane SET NOT NULL;

-- 5. Update the index to include lane
DROP INDEX IF EXISTS public.idx_daily_usage_user_day;
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_day_lane
  ON public.daily_usage(user_id, day_utc, lane);


-- 6. Replace submit_swipe function with lane-aware version
CREATE OR REPLACE FUNCTION public.submit_swipe(
  p_candidate_id uuid,
  p_action text,
  p_lane text DEFAULT 'match'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_viewer_id uuid;
  v_limit int;
  v_day date;
  v_used int;
BEGIN
  -- Get authenticated user ID
  v_viewer_id := auth.uid();
  
  if v_viewer_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_action not in ('reject','pass','accept') then
    return jsonb_build_object('ok', false, 'error', 'invalid_action');
  end if;

  if p_lane not in ('pals','match') then
    return jsonb_build_object('ok', false, 'error', 'invalid_lane');
  end if;

  if v_viewer_id = p_candidate_id then
    return jsonb_build_object('ok', false, 'error', 'invalid_candidate');
  end if;

  -- Prevent concurrency issues for accept spam
  perform pg_advisory_xact_lock(hashtext(v_viewer_id::text || p_lane));

  v_day := (now() at time zone 'utc')::date;

  -- Load entitlement (lazy create if missing)
  insert into public.user_entitlements(user_id)
  values (v_viewer_id)
  on conflict (user_id) do nothing;

  select likes_per_day into v_limit
  from public.user_entitlements
  where user_id = v_viewer_id;

  -- If accept, enforce limit per lane (NULL = unlimited)
  if p_action = 'accept' and v_limit is not null then
    insert into public.daily_usage(user_id, day_utc, lane, likes_used)
    values (v_viewer_id, v_day, p_lane, 0)
    on conflict (user_id, day_utc, lane) do nothing;

    select likes_used into v_used
    from public.daily_usage
    where user_id = v_viewer_id 
      and day_utc = v_day
      and lane = p_lane;

    if v_used >= v_limit then
      return jsonb_build_object(
        'ok', false,
        'error', 'daily_limit_reached',
        'lane', p_lane,
        'limit', v_limit,
        'used', v_used
      );
    end if;

    update public.daily_usage
    set likes_used = likes_used + 1,
        updated_at = now()
    where user_id = v_viewer_id 
      and day_utc = v_day
      and lane = p_lane;

    v_used := v_used + 1;
  else
    -- for non-accept, still compute current used for UI
    select coalesce(du.likes_used, 0) into v_used
    from public.daily_usage du
    where du.user_id = v_viewer_id 
      and du.day_utc = v_day
      and du.lane = p_lane;
  end if;

  -- Idempotent upsert
  insert into public.swipes(viewer_id, candidate_id, action)
  values (v_viewer_id, p_candidate_id, p_action)
  on conflict (viewer_id, candidate_id)
  do update set action = excluded.action, created_at = now();

  return jsonb_build_object(
    'ok', true,
    'lane', p_lane,
    'remaining_accepts',
      case
        when v_limit is null then null
        else greatest(v_limit - v_used, 0)
      end
  );
END;
$$;

-- 7. Set search path and grant execute
ALTER FUNCTION public.submit_swipe(uuid, text, text) SET search_path = public, pg_temp;
GRANT EXECUTE ON FUNCTION public.submit_swipe(uuid, text, text) TO authenticated;

-- 8. Revoke old function signature if it exists
-- This ensures clients must use the new signature with lane parameter
REVOKE ALL ON FUNCTION public.submit_swipe(uuid, uuid, text) FROM authenticated;
DROP FUNCTION IF EXISTS public.submit_swipe(uuid, uuid, text);
