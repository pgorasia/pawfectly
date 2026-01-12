-- Migration: Update selfie verification revocation to use status enum
-- Updates triggers to use status='revoked' instead of deleting badges

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

  -- Also revoke the badge from trust_badges (set status to revoked)
  UPDATE trust_badges
  SET status = 'revoked',
      revoked_at = NOW()
  WHERE user_id = OLD.user_id
    AND badge_type = 'selfie_verified'
    AND status = 'earned';

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

    -- Also revoke the badge from trust_badges (set status to revoked)
    UPDATE trust_badges
    SET status = 'revoked',
        revoked_at = NOW()
    WHERE user_id = NEW.user_id
      AND badge_type = 'selfie_verified'
      AND status = 'earned';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
