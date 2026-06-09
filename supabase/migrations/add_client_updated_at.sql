-- Adds client_updated_at to session_sets so offline conflict resolution can
-- compare device-side timestamps against server updated_at.
ALTER TABLE session_sets
  ADD COLUMN IF NOT EXISTS client_updated_at timestamptz;
