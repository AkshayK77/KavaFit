-- Add deload_suggested_at column to profiles if it does not already exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deload_suggested_at timestamptz;
