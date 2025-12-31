-- Migration: Auto-set display_order on photo insert
-- This eliminates the need for getNextDisplayOrder() + UPDATE pattern
-- display_order is automatically set to MAX(display_order) + 1 within (user_id, bucket_type, dog_slot)

-- First, ensure display_order column exists (if it doesn't already)
ALTER TABLE photos ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Create function to calculate next display_order
CREATE OR REPLACE FUNCTION set_photo_display_order()
RETURNS TRIGGER AS $$
DECLARE
  next_order INTEGER;
BEGIN
  -- Only set display_order if not already provided
  IF NEW.display_order IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate next display_order for this (user_id, bucket_type, dog_slot) combination
  IF NEW.bucket_type = 'dog' THEN
    -- For dog photos: match by user_id, bucket_type='dog', and dog_slot
    SELECT COALESCE(MAX(display_order), 0) + 1
    INTO next_order
    FROM photos
    WHERE user_id = NEW.user_id
      AND bucket_type = 'dog'
      AND dog_slot = NEW.dog_slot;
  ELSE
    -- For human photos: match by user_id, bucket_type='human', and dog_slot IS NULL
    SELECT COALESCE(MAX(display_order), 0) + 1
    INTO next_order
    FROM photos
    WHERE user_id = NEW.user_id
      AND bucket_type = 'human'
      AND dog_slot IS NULL;
  END IF;

  NEW.display_order := next_order;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call function before insert
DROP TRIGGER IF EXISTS trigger_set_photo_display_order ON photos;
CREATE TRIGGER trigger_set_photo_display_order
  BEFORE INSERT ON photos
  FOR EACH ROW
  EXECUTE FUNCTION set_photo_display_order();

-- Add index to improve performance of MAX(display_order) query
CREATE INDEX IF NOT EXISTS idx_photos_display_order_lookup 
  ON photos(user_id, bucket_type, dog_slot, display_order)
  WHERE display_order IS NOT NULL;

