-- ============================================================
-- FORGE — Full schema + RLS policies
-- Run this in the Supabase SQL Editor (as service role)
-- ============================================================

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age integer,
  weight_kg decimal,
  height_cm decimal,
  fitness_goal text CHECK (fitness_goal IN ('build_muscle','lose_fat','improve_fitness','maintain')),
  experience_level text CHECK (experience_level IN ('beginner','intermediate','advanced','returning')),
  sessions_per_week integer,
  equipment_available text CHECK (equipment_available IN ('full_gym','dumbbells_only','bodyweight','bands_and_dbs')),
  injuries text,
  dietary_preference text CHECK (dietary_preference IN ('none','vegetarian','vegan','halal_kosher')),
  allergies text,
  daily_calorie_target integer,
  daily_protein_target integer,
  onboarding_complete boolean DEFAULT false,
  avatar_url text,
  city text,
  deload_suggested_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  muscle_groups text[] NOT NULL,
  equipment_needed text,
  difficulty text,
  instructions text,
  is_compound boolean DEFAULT false
);

CREATE TABLE workout_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by_ai boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid REFERENCES workout_plans(id) ON DELETE CASCADE,
  day_name text NOT NULL,
  day_order integer NOT NULL,
  exercise_ids jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_day_id uuid REFERENCES plan_days(id),
  date date NOT NULL DEFAULT CURRENT_DATE,
  name text,
  explanation text,
  duration_minutes integer,
  notes text,
  completed_at timestamptz
);

CREATE TABLE session_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES exercises(id),
  set_number integer NOT NULL,
  reps integer,
  weight_kg decimal,
  rpe integer CHECK (rpe BETWEEN 1 AND 10),
  completed boolean DEFAULT false,
  client_updated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg decimal,
  chest_cm decimal,
  waist_cm decimal,
  hips_cm decimal,
  arms_cm decimal,
  thighs_cm decimal,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE muscle_volume_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  muscle_group text NOT NULL,
  total_sets integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start, muscle_group)
);

CREATE TABLE meal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_name text NOT NULL,
  ingredients text,
  instructions text,
  protein_g decimal,
  carbs_g decimal,
  fat_g decimal,
  calories integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE progress_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  request_count integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE muscle_volume_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_photos ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles: own rows" ON profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- exercises: public read, no user writes
CREATE POLICY "exercises: public read" ON exercises
  FOR SELECT USING (true);

-- workout_plans
CREATE POLICY "workout_plans: own rows" ON workout_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- plan_days: accessible if user owns the parent plan
CREATE POLICY "plan_days: own rows" ON plan_days
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM workout_plans
      WHERE workout_plans.id = plan_days.plan_id
        AND workout_plans.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_plans
      WHERE workout_plans.id = plan_days.plan_id
        AND workout_plans.user_id = auth.uid()
    )
  );

-- sessions
CREATE POLICY "sessions: own rows" ON sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- session_sets: accessible if user owns the parent session
CREATE POLICY "session_sets: own rows" ON session_sets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_sets.session_id
        AND sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions
      WHERE sessions.id = session_sets.session_id
        AND sessions.user_id = auth.uid()
    )
  );

-- measurements
CREATE POLICY "measurements: own rows" ON measurements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- muscle_volume_log
CREATE POLICY "muscle_volume_log: own rows" ON muscle_volume_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- meal_history
CREATE POLICY "meal_history: own rows" ON meal_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- progress_photos
CREATE POLICY "progress_photos: own rows" ON progress_photos
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- rate_limits (written only by the ai-proxy edge function via service role;
-- user-scoped RLS prevents any client from reading or writing other users' rows)
CREATE POLICY "rate_limits: own rows" ON rate_limits
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Auto-create profile row on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
