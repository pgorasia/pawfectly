-- Quick fix: Add mime_type column to photos table
-- Run this in Supabase SQL Editor if migration 002 hasn't been run

-- Add mime_type column if it doesn't exist
ALTER TABLE photos ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Set default value for existing rows
UPDATE photos SET mime_type = 'image/jpeg' WHERE mime_type IS NULL;

-- Make it NOT NULL with default (this will work for new rows)
ALTER TABLE photos ALTER COLUMN mime_type SET DEFAULT 'image/jpeg';
ALTER TABLE photos ALTER COLUMN mime_type SET NOT NULL;

