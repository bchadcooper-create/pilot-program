-- Migrations applied for the automated leaderboard seed-user system.
-- Run once, via Supabase migration tooling — already applied live as of
-- Sep 10, 2026. Kept here for repo history / disaster recovery only.

-- 1. Enable extensions needed for scheduled HTTP calls from Postgres.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 2. Tracks which seed-user batches have been created. batch_number is
--    the source of truth for progress, not a counter that could drift.
create table if not exists seed_batches (
  batch_number int primary key,
  created_at timestamptz not null default now(),
  emails text[] not null
);

-- Batch 0 = the two accounts created manually on Sep 10, 2026
-- (Mike Sorensen, Jennifer Alvarez).
insert into seed_batches (batch_number, emails, created_at) values
  (0, array['mike.sorensen@flightcrew.fit','jennifer.alvarez@flightcrew.fit'], now())
on conflict (batch_number) do nothing;

-- 3. Store the admin secret in Vault rather than embedding it in
--    plaintext inside the cron job definition below.
--    select vault.create_secret('<value>', 'fcf_admin_seed_secret', '...');
--    (Not re-run here — already created; re-running would create a
--    second secret with a different ID rather than updating this one.)

-- 4. Daily cron check — the function itself enforces the real 2-day
--    gap between batches and self-stops once all 4 scheduled batches
--    (8 users) are done, on top of the 2 created manually (10 total).
select cron.schedule(
  'fcf-seed-users-batch-check',
  '0 15 * * *',
  $$
  select net.http_post(
    url := 'https://dnxkydxbyihgsictbzjz.supabase.co/functions/v1/fcf-seed-users',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Seed-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fcf_admin_seed_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To stop this permanently once all 10 users exist:
--   select cron.unschedule('fcf-seed-users-batch-check');
