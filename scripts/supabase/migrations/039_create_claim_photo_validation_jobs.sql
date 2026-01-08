-- Migration: Create claim_photo_validation_jobs function
-- This function atomically claims jobs for processing and increments attempts counter
-- Incrementing attempts during claim ensures retries/backoff are consistent and concurrency-safe

CREATE OR REPLACE FUNCTION public.claim_photo_validation_jobs(
  p_limit int DEFAULT 10,
  p_worker text DEFAULT 'unknown'
)
RETURNS TABLE(
  id uuid,
  photo_id uuid,
  user_id uuid,
  storage_path text,
  bucket_type text,
  target_type text,
  dog_slot integer,
  attempts integer,
  last_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Atomically claim jobs and increment attempts
  -- This ensures attempts are incremented exactly once per claim, preventing race conditions
  RETURN QUERY
  WITH claimed AS (
    UPDATE photo_validation_jobs
    SET 
      locked_at = NOW(),
      locked_by = p_worker,
      status = 'processing',
      attempts = photo_validation_jobs.attempts + 1  -- Increment attempts as part of claim
    WHERE photo_validation_jobs.id IN (
      SELECT j.id
      FROM photo_validation_jobs j
      WHERE j.status = 'queued'
        AND j.next_run_at <= NOW()
        AND (j.locked_at IS NULL OR j.locked_at < NOW() - INTERVAL '5 minutes')
      ORDER BY j.next_run_at ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING 
      photo_validation_jobs.id,
      photo_validation_jobs.photo_id,
      photo_validation_jobs.user_id,
      photo_validation_jobs.storage_path,
      photo_validation_jobs.bucket_type,
      photo_validation_jobs.target_type,
      photo_validation_jobs.dog_slot,
      photo_validation_jobs.attempts,
      photo_validation_jobs.last_error
  )
  SELECT 
    c.id,
    c.photo_id,
    c.user_id,
    c.storage_path,
    c.bucket_type,
    c.target_type,
    c.dog_slot,
    c.attempts,
    c.last_error
  FROM claimed c;
END;
$$;

-- Grant execute permission to service role (used by edge functions)
GRANT EXECUTE ON FUNCTION public.claim_photo_validation_jobs(int, text) TO service_role;
