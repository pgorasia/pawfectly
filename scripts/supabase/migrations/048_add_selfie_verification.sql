-- Migration: Add selfie verification support
-- Adds columns to profiles, creates attempts tracking table, and RPC function

-- Add selfie verification columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS selfie_verified_at timestamptz NULL,
ADD COLUMN IF NOT EXISTS selfie_verified_method text NULL DEFAULT 'on_device_v1',
ADD COLUMN IF NOT EXISTS selfie_verified_photo_id uuid NULL REFERENCES photos(id) ON DELETE SET NULL;

-- Create index for selfie verification queries
CREATE INDEX IF NOT EXISTS idx_profiles_selfie_verified_at ON profiles(selfie_verified_at) 
  WHERE selfie_verified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_selfie_verified_photo_id ON profiles(selfie_verified_photo_id) 
  WHERE selfie_verified_photo_id IS NOT NULL;

-- Add metadata column to trust_badges for badge-specific data (e.g., verified_photo_id)
ALTER TABLE trust_badges
ADD COLUMN IF NOT EXISTS metadata JSONB NULL;

-- Create index for metadata queries
CREATE INDEX IF NOT EXISTS idx_trust_badges_metadata ON trust_badges USING GIN(metadata);

-- Create selfie_verification_attempts table for rate limiting
CREATE TABLE IF NOT EXISTS selfie_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL, -- Hourly bucket start time
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  -- Unique constraint: one row per user per hour
  UNIQUE(user_id, window_start)
);

-- Create indexes for attempts table
CREATE INDEX IF NOT EXISTS idx_selfie_attempts_user_id ON selfie_verification_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_selfie_attempts_window_start ON selfie_verification_attempts(window_start);
CREATE INDEX IF NOT EXISTS idx_selfie_attempts_last_attempt ON selfie_verification_attempts(user_id, last_attempt_at DESC);

-- Enable RLS on attempts table
ALTER TABLE selfie_verification_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for selfie_verification_attempts table
-- Users can only see their own attempts
CREATE POLICY "Users can view their own selfie verification attempts"
  ON selfie_verification_attempts FOR SELECT
  USING (auth.uid() = user_id);

-- Users cannot insert/update attempts directly (only via RPC function)
-- This ensures atomic increment and proper rate limiting

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_selfie_attempts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_selfie_attempts_updated_at ON selfie_verification_attempts;
CREATE TRIGGER trigger_update_selfie_attempts_updated_at
  BEFORE UPDATE ON selfie_verification_attempts
  FOR EACH ROW
  EXECUTE FUNCTION update_selfie_attempts_updated_at();

-- RPC Function: can_attempt_selfie_verification()
-- Atomically checks and increments attempt count
-- Returns: { allowed: boolean, remaining_hourly: integer, remaining_daily: integer, retry_after_seconds: integer | null }
CREATE OR REPLACE FUNCTION can_attempt_selfie_verification()
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

  -- Get or create hourly attempt record
  INSERT INTO selfie_verification_attempts (user_id, window_start, attempt_count, last_attempt_at)
  VALUES (user_id_val, hourly_window_start, 1, now_timestamp)
  ON CONFLICT (user_id, window_start) 
  DO UPDATE SET
    attempt_count = selfie_verification_attempts.attempt_count + 1,
    last_attempt_at = now_timestamp,
    updated_at = now_timestamp
  RETURNING attempt_count, last_attempt_at INTO hourly_attempts, last_attempt;

  -- Count daily attempts (sum of all hourly windows in current day)
  SELECT COALESCE(SUM(attempt_count), 0) INTO daily_attempts
  FROM selfie_verification_attempts
  WHERE user_id = user_id_val
    AND window_start >= daily_window_start
    AND window_start < daily_window_start + INTERVAL '1 day';

  -- Check cooldown (client-side enforcement)
  -- If last attempt was less than cooldown_seconds ago, calculate retry_after
  DECLARE
    seconds_since_last_attempt INTEGER;
    retry_after_seconds INTEGER;
  BEGIN
    seconds_since_last_attempt := EXTRACT(EPOCH FROM (now_timestamp - last_attempt))::INTEGER;
    
    IF seconds_since_last_attempt < cooldown_seconds THEN
      retry_after_seconds := cooldown_seconds - seconds_since_last_attempt;
    ELSE
      retry_after_seconds := NULL;
    END IF;

    -- Determine if attempt is allowed
    DECLARE
      allowed BOOLEAN;
      remaining_hourly INTEGER;
      remaining_daily INTEGER;
    BEGIN
      allowed := hourly_attempts <= max_hourly 
                 AND daily_attempts <= max_daily 
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
  END;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION can_attempt_selfie_verification() TO authenticated;

-- Function to revoke selfie verification if verified photo is deleted
-- This trigger will automatically revoke the badge when the verified photo is deleted
CREATE OR REPLACE FUNCTION revoke_selfie_verification_on_photo_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- If a photo is deleted and it was the verified photo, revoke verification
  UPDATE profiles
  SET 
    selfie_verified_at = NULL,
    selfie_verified_method = NULL,
    selfie_verified_photo_id = NULL,
    updated_at = NOW()
  WHERE selfie_verified_photo_id = OLD.id;

  -- Also remove the badge from trust_badges
  DELETE FROM trust_badges
  WHERE user_id = OLD.user_id
    AND badge_type = 'selfie_verified';

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to revoke verification when photo is deleted
DROP TRIGGER IF EXISTS trigger_revoke_selfie_on_photo_delete ON photos;
CREATE TRIGGER trigger_revoke_selfie_on_photo_delete
  AFTER DELETE ON photos
  FOR EACH ROW
  EXECUTE FUNCTION revoke_selfie_verification_on_photo_delete();

-- Function to revoke selfie verification if verified photo is replaced (status changes to rejected)
-- This handles the case where a photo is replaced (old one gets rejected/deleted)
CREATE OR REPLACE FUNCTION revoke_selfie_verification_on_photo_replacement()
RETURNS TRIGGER AS $$
BEGIN
  -- If verified photo status changes to rejected, revoke verification
  IF OLD.status != 'rejected' AND NEW.status = 'rejected' THEN
    UPDATE profiles
    SET 
      selfie_verified_at = NULL,
      selfie_verified_method = NULL,
      selfie_verified_photo_id = NULL,
      updated_at = NOW()
    WHERE selfie_verified_photo_id = NEW.id;

    -- Also remove the badge from trust_badges
    DELETE FROM trust_badges
    WHERE user_id = NEW.user_id
      AND badge_type = 'selfie_verified';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to revoke verification when verified photo is rejected
DROP TRIGGER IF EXISTS trigger_revoke_selfie_on_photo_rejection ON photos;
CREATE TRIGGER trigger_revoke_selfie_on_photo_rejection
  AFTER UPDATE OF status ON photos
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION revoke_selfie_verification_on_photo_replacement();
