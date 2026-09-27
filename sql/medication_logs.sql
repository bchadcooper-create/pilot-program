-- Medication / supplement "taken" check-offs. The definitions themselves
-- (name, dose, unit, times, reminder on/off) live in user_profiles.
-- profile_data.medications, which is already per-user and RLS-protected;
-- only the per-dose log needs its own table, because it grows by a few
-- rows a day and should not bloat the profile blob.
--
-- One row per (user, medication, local date, scheduled time). Un-checking
-- a dose deletes the row. Dates are the user's LOCAL day (localDateStr()
-- in app.js), matching daily_inputs.

CREATE TABLE medication_logs (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  med_id text NOT NULL,
  date date NOT NULL,
  time text NOT NULL,          -- 'HH:MM' scheduled slot, matches profile times
  taken_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, med_id, date, time)
);

ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own medication logs" ON medication_logs
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "users can insert own medication logs" ON medication_logs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "users can delete own medication logs" ON medication_logs
  FOR DELETE USING ((select auth.uid()) = user_id);
