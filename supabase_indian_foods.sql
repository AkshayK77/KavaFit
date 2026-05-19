-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS indian_foods (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  food_code             TEXT    UNIQUE,
  food_name             TEXT    NOT NULL,
  energy_kcal           NUMERIC,
  protein_g             NUMERIC,
  carbs_g               NUMERIC,
  fat_g                 NUMERIC,
  fiber_g               NUMERIC,
  serving_unit          TEXT,
  serving_energy_kcal   NUMERIC,
  serving_protein_g     NUMERIC,
  serving_carbs_g       NUMERIC,
  serving_fat_g         NUMERIC,
  serving_fiber_g       NUMERIC,
  name_search           TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', food_name)) STORED,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS indian_foods_name_search_idx ON indian_foods USING GIN (name_search);
CREATE INDEX IF NOT EXISTS indian_foods_name_lower_idx  ON indian_foods (lower(food_name));

ALTER TABLE indian_foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read indian_foods"
  ON indian_foods FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert indian_foods"
  ON indian_foods FOR INSERT TO service_role WITH CHECK (true);
