-- 055_selfie_verification_requests_phase1.sql
-- Selfie Verification (Phase 1): manual review workflow
-- - Users submit a selfie + reference photo
-- - Request stored in DB and selfie stored in private Storage bucket `selfie_verifications`
-- - Admin/service-role reviews and approves/rejects

BEGIN;

-- -----------------------------
-- Requests table
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.selfie_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_photo_id uuid NULL REFERENCES public.photos(id) ON DELETE SET NULL,
  selfie_storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz NULL,
  reviewed_by uuid NULL REFERENCES auth.users(id),
  review_reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS selfie_verification_requests_user_submitted_idx
  ON public.selfie_verification_requests (user_id, submitted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS selfie_verification_requests_one_pending_per_user
  ON public.selfie_verification_requests (user_id)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS set_selfie_verification_requests_updated_at ON public.selfie_verification_requests;
CREATE TRIGGER set_selfie_verification_requests_updated_at
BEFORE UPDATE ON public.selfie_verification_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.selfie_verification_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own requests
DROP POLICY IF EXISTS "selfie_verification_requests_select_own" ON public.selfie_verification_requests;
CREATE POLICY "selfie_verification_requests_select_own"
ON public.selfie_verification_requests
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can insert their own request rows (the app uses an RPC, but keep a policy anyway)
DROP POLICY IF EXISTS "selfie_verification_requests_insert_own" ON public.selfie_verification_requests;
CREATE POLICY "selfie_verification_requests_insert_own"
ON public.selfie_verification_requests
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND selfie_storage_path LIKE ('users/' || auth.uid()::text || '/%')
);

-- Users can cancel their own pending request (optional; useful for UX)
DROP POLICY IF EXISTS "selfie_verification_requests_cancel_own" ON public.selfie_verification_requests;
CREATE POLICY "selfie_verification_requests_cancel_own"
ON public.selfie_verification_requests
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (
  user_id = auth.uid()
  AND status IN ('cancelled') -- allow transitioning to cancelled only
);

-- -----------------------------
-- Storage policies for private selfie bucket
-- Bucket name: selfie_verifications (private)
-- File paths enforced: users/<uid>/...
-- -----------------------------
-- Insert (upload) own selfie images
DROP POLICY IF EXISTS "selfie_verifications_insert_own" ON storage.objects;
CREATE POLICY "selfie_verifications_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'selfie_verifications'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Select own selfie images (not required for the flow, but useful for debugging / future UX)
DROP POLICY IF EXISTS "selfie_verifications_select_own" ON storage.objects;
CREATE POLICY "selfie_verifications_select_own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'selfie_verifications'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Delete own selfie images (optional; enables cleanup if request fails client-side)
DROP POLICY IF EXISTS "selfie_verifications_delete_own" ON storage.objects;
CREATE POLICY "selfie_verifications_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'selfie_verifications'
  AND (storage.foldername(name))[1] = 'users'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- -----------------------------
-- RPC: Submit selfie verification request
-- - Validates reference photo is owned + approved human
-- - Enforces attempt limits by calling can_attempt_selfie_verification()
-- - Enforces one pending request per user
-- -----------------------------
CREATE OR REPLACE FUNCTION public.submit_selfie_verification_request(
  p_reference_photo_id uuid,
  p_selfie_storage_path text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_attempt jsonb;
  v_pending uuid;
  v_ref_storage_path text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_reference_photo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_reference_photo');
  END IF;

  IF p_selfie_storage_path IS NULL OR length(trim(p_selfie_storage_path)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_selfie_path');
  END IF;

  IF p_selfie_storage_path NOT LIKE ('users/' || v_me::text || '/%') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_selfie_path');
  END IF;

  SELECT id
  INTO v_pending
  FROM public.selfie_verification_requests
  WHERE user_id = v_me AND status = 'pending'
  LIMIT 1;

  IF v_pending IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pending_request_exists', 'request_id', v_pending);
  END IF;

  -- Reference photo must exist, belong to the user, be human, and be approved
  SELECT p.storage_path
  INTO v_ref_storage_path
  FROM public.photos p
  WHERE p.id = p_reference_photo_id
    AND p.user_id = v_me
    AND p.bucket_type = 'human'
    AND p.contains_human = true
    AND p.status = 'approved'
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_ref_storage_path IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reference_photo');
  END IF;

  -- Increment attempt count (rate-limited). This is the authoritative enforcement point.
  v_attempt := public.can_attempt_selfie_verification();

  IF COALESCE((v_attempt->>'allowed')::boolean, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited', 'limits', v_attempt);
  END IF;

  INSERT INTO public.selfie_verification_requests (
    user_id, reference_photo_id, selfie_storage_path, status, metadata
  ) VALUES (
    v_me,
    p_reference_photo_id,
    p_selfie_storage_path,
    'pending',
    jsonb_build_object('reference_storage_path', v_ref_storage_path) || COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_pending;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_pending,
    'status', 'pending',
    'limits', v_attempt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_selfie_verification_request(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_selfie_verification_request(uuid, text, jsonb) TO authenticated;

-- -----------------------------
-- RPC: Admin/service-role review
-- -----------------------------
CREATE OR REPLACE FUNCTION public.review_selfie_verification_request(
  p_request_id uuid,
  p_approved boolean,
  p_reason text DEFAULT NULL,
  p_method text DEFAULT 'manual_review_v1'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := auth.role();
  v_me uuid := auth.uid();
  v_req public.selfie_verification_requests%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  -- This function is intended for server-side/admin usage only.
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT *
  INTO v_req
  FROM public.selfie_verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_found');
  END IF;

  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_req.status);
  END IF;

  UPDATE public.selfie_verification_requests
  SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      reviewed_at = v_now,
      reviewed_by = v_me,
      review_reason = p_reason,
      updated_at = v_now
  WHERE id = v_req.id;

  IF p_approved THEN
    -- Mark profile as verified
    UPDATE public.profiles
    SET selfie_verified_at = v_now,
        selfie_verified_method = p_method,
        selfie_verified_photo_id = v_req.reference_photo_id,
        updated_at = v_now
    WHERE user_id = v_req.user_id;

    -- Upsert badge
    INSERT INTO public.trust_badges (user_id, badge_type, status, earned_at, revoked_at, metadata)
    VALUES (
      v_req.user_id,
      'selfie_verified',
      'earned',
      v_now,
      NULL,
      jsonb_build_object(
        'request_id', v_req.id,
        'reference_photo_id', v_req.reference_photo_id,
        'selfie_storage_path', v_req.selfie_storage_path,
        'method', p_method
      )
    )
    ON CONFLICT (user_id, badge_type)
    DO UPDATE SET
      status = 'earned',
      earned_at = v_now,
      revoked_at = NULL,
      metadata = EXCLUDED.metadata;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END);
END;
$$;

REVOKE ALL ON FUNCTION public.review_selfie_verification_request(uuid, boolean, text, text) FROM PUBLIC;

COMMIT;
