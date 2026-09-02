-- Web subscriptions via Stripe, alongside iOS via StoreKit. Both write the
-- same subscriptions row; `platform` records which paid for it, so an iOS
-- renewal can never be mistaken for a web one or vice versa.
--
-- Run AFTER sql/subscriptions.sql.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Looked up by the webhook when an event arrives without metadata, so it
-- needs an index rather than a sequential scan of every subscriber.
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx
  ON subscriptions (stripe_customer_id);
