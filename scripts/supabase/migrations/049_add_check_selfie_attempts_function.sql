-- Migration: Add check function for selfie verification attempts (read-only, doesn't increment)
-- This allows checking limits before starting the flow without counting as an attempt

-- Function to check if user can attempt selfie verification (read-only, doesn't increment)
CREATE OR REPLACE FUNCTION check_selfie_verification_limits()
RETURNS JSON AS $$
DECLARE
  user_id_val UUID;
  now_timestamp timestamptz;
  hourly_window_start timestamptz;
  daily_window_start timestamptz;
  hourly_attempts INTEGER;
  daily_attempts INTEGER;
  last_attempt timestamptz;
  cooldown_seconds INTEGER := 15; -- Client-side cooldown (15 seconds)
  max_hourly INTEGER := 5;
  max_daily INTEGER := 20;
  result JSON;
BEGIN
  -- Get current user ID from auth context
  user_id_val := auth.uid();
  
  IF user_id_val IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  now_timestamp := NOW();
  -- Round down to hour start (e.g., 14:30:00 -> 14:00:00)
  hourly_window_start := date_trunc('hour', now_timestamp);
  -- Round down to day start (e.g., 2024-01-15 14:30:00 -> 2024-01-15 00:00:00)
  daily_window_start := date_trunc('day', now_timestamp);

  -- Get current attempt counts WITHOUT incrementing
  SELECT COALESCE(attempt_count, 0), COALESCE(last_attempt_at, now_timestamp - INTERVAL '1 day')
  INTO hourly_attempts, last_attempt
  FROM selfie_verification_attempts
  WHERE user_id = user_id_val
    AND window_start = hourly_window_start
  LIMIT 1;

  -- If no record exists, set defaults
  IF hourly_attempts IS NULL THEN
    hourly_attempts := 0;
    last_attempt := now_timestamp - INTERVAL '1 day';
  END IF;

  -- Count daily attempts (sum of all hourly windows in current day)
  SELECT COALESCE(SUM(attempt_count), 0) INTO daily_attempts
  FROM selfie_verification_attempts
  WHERE user_id = user_id_val
    AND window_start >= daily_window_start
    AND window_start < daily_window_start + INTERVAL '1 day';

  -- Check cooldown (client-side enforcement)
  DECLARE
    seconds_since_last_attempt INTEGER;
    retry_after_seconds INTEGER;
    allowed BOOLEAN;
    remaining_hourly INTEGER;
    remaining_daily INTEGER;
  BEGIN
    seconds_since_last_attempt := EXTRACT(EPOCH FROM (now_timestamp - last_attempt))::INTEGER;
    
    IF seconds_since_last_attempt < cooldown_seconds THEN
      retry_after_seconds := cooldown_seconds - seconds_since_last_attempt;
    ELSE
      retry_after_seconds := NULL;
    END IF;

    -- Determine if attempt is allowed (check if they COULD attempt, not if they already did)
    allowed := hourly_attempts < max_hourly 
               AND daily_attempts < max_daily 
               AND (retry_after_seconds IS NULL OR retry_after_seconds = 0);
    
    remaining_hourly := GREATEST(0, max_hourly - hourly_attempts);
    remaining_daily := GREATEST(0, max_daily - daily_attempts);

    -- Build result JSON
    result := json_build_object(
      'allowed', allowed,
      'remaining_hourly', remaining_hourly,
      'remaining_daily', remaining_daily,
      'retry_after_seconds', retry_after_seconds
    );
  END;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_selfie_verification_limits() TO authenticated;
