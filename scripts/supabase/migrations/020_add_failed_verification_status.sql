-- Migration: Add 'failed_verification' status to profiles table
-- This status is used when photo validation fails, requiring user to resubmit photos

-- Drop existing constraint if it exists
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_status_check;

-- Add new constraint allowing: 'draft', 'active', 'failed_verification'
ALTER TABLE profiles ADD CONSTRAINT profiles_status_check 
  CHECK (status IN ('draft', 'active', 'failed_verification'));

-- Note: If profiles.status is defined as an enum type instead of a CHECK constraint,
-- you may need to use: ALTER TYPE profile_status_type ADD VALUE 'failed_verification';

