-- Tracks daily AI food-photo analysis usage per user, for the free-tier
-- rate limit (5/day). One row per user per calendar date (server-side
-- date, not device-local — good enough for a daily cap; exact midnight
-- boundary drift across timezones is not worth solving for this).
--
-- The Super User bypasses this table entirely (checked by email in the
-- edge function before any query here), so no row ever exists for that
-- account.

CREATE TABLE food_photo_usage (
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  photo_count integer NOT NULL DEFAULT 0,
  barcode_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE food_photo_usage ENABLE ROW LEVEL SECURITY;

-- The edge function runs with the calling user's own JWT (not a service
-- role key), so it needs the same RLS access a user would have to their
-- own row — matching the pattern meal_logs already uses.
CREATE POLICY "users can view own usage" ON food_photo_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users can insert own usage" ON food_photo_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can update own usage" ON food_photo_usage
  FOR UPDATE USING (auth.uid() = user_id);
