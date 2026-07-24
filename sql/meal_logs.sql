-- Meal logging table. One row per logged meal (breakfast/lunch/dinner/snack),
-- with all food items for that meal stored together in meal_data, matching
-- the same JSONB pattern workout_sessions already uses for session_data.

CREATE TABLE meal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  meal_type text NOT NULL DEFAULT 'snack',
  meal_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own meals" ON meal_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users can insert own meals" ON meal_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own meals" ON meal_logs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users can delete own meals" ON meal_logs
  FOR DELETE USING (auth.uid() = user_id);

-- Speeds up "get today's meals" / "get meals in date range" queries, which
-- is the main access pattern (same reasoning as the workout_sessions index).
CREATE INDEX idx_meal_logs_user_date ON meal_logs(user_id, logged_at DESC);
