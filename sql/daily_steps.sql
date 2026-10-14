-- Daily step totals, one row per member per day, for the step goal streak.
-- Before this, steps were only ever held in memory for today (from Oura's
-- daily_activity or Apple Health), so there was no history to count a
-- streak from.
--
-- goal is the member's step goal when the row was written for that day.
-- Rows filled in for past days from Oura leave it null, and are judged
-- against the current goal.
create table if not exists public.daily_steps (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  steps      integer not null check (steps >= 0),
  goal       integer check (goal is null or goal > 0),
  source     text,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.daily_steps enable row level security;

-- All four policies, including UPDATE: the app writes with upsert, which
-- Postgres checks against the UPDATE policy when the row already exists.
create policy "daily_steps select own" on public.daily_steps for select using (auth.uid() = user_id);
create policy "daily_steps insert own" on public.daily_steps for insert with check (auth.uid() = user_id);
create policy "daily_steps update own" on public.daily_steps for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_steps delete own" on public.daily_steps for delete using (auth.uid() = user_id);

-- A day's count only goes up. Oura and Apple Health can disagree, and the
-- app may write an earlier, lower reading after a higher one; keep the
-- larger. Same rule as the Today screen (todayStepCount takes the larger).
create or replace function public.daily_steps_keep_max()
returns trigger language plpgsql set search_path = public as $$
begin
  new.steps := greatest(old.steps, new.steps);
  new.updated_at := now();
  return new;
end $$;

create trigger daily_steps_keep_max before update on public.daily_steps
  for each row execute function public.daily_steps_keep_max();
