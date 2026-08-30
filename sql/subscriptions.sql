-- Subscription entitlement, written by the server (or by a StoreKit
-- receipt-validation function), never by the client.
--
-- The client may READ its own row to decide what to show, but must not be
-- able to write it — otherwise Pro is a one-line console edit away. RLS
-- below grants SELECT only; inserts and updates come from a service-role
-- context.
CREATE TABLE subscriptions (
  user_id uuid REFERENCES auth.users(id) PRIMARY KEY,
  tier text NOT NULL DEFAULT 'free',          -- 'free' | 'pro'
  status text NOT NULL DEFAULT 'inactive',    -- 'active' | 'expired' | 'grace' | 'inactive'
  platform text,                              -- 'ios' | 'web' | 'comp'
  product_id text,                            -- e.g. fcf_pro_annual
  current_period_end timestamptz,
  original_transaction_id text,               -- StoreKit: stable across renewals
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only for the owner. Deliberately NO insert/update policy: entitlement
-- is granted server-side after receipt validation, so a client cannot mark
-- itself Pro.
CREATE POLICY "users can read own subscription" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Weekly photo quota for the free tier. The existing food_photo_usage table
-- counts per DAY; free tier is now 3 per WEEK, so the week start is stored
-- explicitly rather than inferred, keeping the boundary stable regardless of
-- which day someone happens to open the app.
CREATE TABLE photo_quota_weekly (
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  week_start date NOT NULL,                   -- Monday, in the user's local week
  photo_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE photo_quota_weekly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own photo quota" ON photo_quota_weekly
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users can insert own photo quota" ON photo_quota_weekly
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users can update own photo quota" ON photo_quota_weekly
  FOR UPDATE USING (auth.uid() = user_id);
