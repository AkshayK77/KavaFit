-- Run this in the Supabase SQL editor to enable per-user rate limiting on the ai-proxy edge function
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count int NOT NULL DEFAULT 1
);

-- No RLS — the edge function accesses this table via the service role key
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
