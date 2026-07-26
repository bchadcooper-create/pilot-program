-- Cross-device sync for the "daily inputs" that were previously
-- localStorage-only: water consumed, flight hours, sleep hours, morning
-- readiness. One row per user per calendar day (the user's LOCAL day,
-- not UTC — see localDateStr() in app.js, used consistently here to
-- avoid the exact same local-vs-UTC date bug already fixed elsewhere
-- for the training calendar).
--
-- localStorage remains as an instant-response cache/offline fallback;
-- this table is the actual cross-device source of truth.

CREATE TABLE daily_inputs (
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  date date NOT NULL,
  water_in numeric,
  flight_hrs numeric,
  flight_hrs_touched boolean DEFAULT false,
  sleep_hours numeric,
  readiness integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE daily_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own daily inputs" ON daily_inputs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users can insert own daily inputs" ON daily_inputs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own daily inputs" ON daily_inputs
  FOR UPDATE USING (auth.uid() = user_id);
