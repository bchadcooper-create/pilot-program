-- Crew feed: the social layer (phase 3 of the running build, Oct 18 2026).
-- Opt in. Nothing here exists for a member until they create a crew profile.
-- Every table is row-level secured; the client never uses a service key.

create extension if not exists citext;

-- Who you are on the feed. callsign is the same call sign as the boards.
create table if not exists crew_profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  callsign    citext not null unique,
  base        text,                       -- home base airport code, e.g. PHX
  airline     text,                       -- optional, free text, 40 chars
  bio         text,                       -- 140 chars
  visibility  text not null default 'everyone' check (visibility in ('everyone','followers')),
  auto_post   boolean not null default true,
  rules_accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table crew_profiles enable row level security;
create policy crew_profiles_read  on crew_profiles for select to authenticated using (true);
create policy crew_profiles_ins   on crew_profiles for insert to authenticated with check (auth.uid() = user_id);
create policy crew_profiles_upd   on crew_profiles for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy crew_profiles_del   on crew_profiles for delete to authenticated using (auth.uid() = user_id);

create table if not exists crew_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table crew_blocks enable row level security;
create policy crew_blocks_own on crew_blocks for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- Either direction of a block hides the two from each other everywhere.
create or replace function crew_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create table if not exists crew_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'active' check (status in ('active','pending')),
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table crew_follows enable row level security;
create policy crew_follows_read on crew_follows for select to authenticated using (auth.uid() = follower_id or auth.uid() = followee_id);
create policy crew_follows_ins  on crew_follows for insert to authenticated with check (auth.uid() = follower_id and not crew_blocked(follower_id, followee_id));
-- The person being followed approves a pending request.
create policy crew_follows_upd  on crew_follows for update to authenticated using (auth.uid() = followee_id) with check (auth.uid() = followee_id);
create policy crew_follows_del  on crew_follows for delete to authenticated using (auth.uid() = follower_id or auth.uid() = followee_id);

create or replace function crew_follows_active(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crew_follows where follower_id = viewer and followee_id = owner and status = 'active');
$$;

-- One row per shared workout. Written by the client when a session is saved
-- (auto_post) or when the member shares one by hand. No location beyond an
-- airport code the member chose to show.
create table if not exists crew_activities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  session_key  text not null,
  kind         text not null check (kind in ('run','walk','workout')),
  title        text not null,              -- "Outdoor Run", "Upper Pull"
  muscle_group text,
  env          text,                       -- comm | hotel | room | band
  airport      text,                       -- where, if the member shows it
  miles        numeric(6,2),
  seconds      integer,
  sets_logged  integer,
  note         text,                       -- 280 chars, member's own words
  performed_at timestamptz not null,
  visibility   text not null default 'everyone' check (visibility in ('everyone','followers','private')),
  created_at   timestamptz not null default now(),
  unique (user_id, session_key)
);
create index if not exists crew_activities_feed on crew_activities (performed_at desc);
create index if not exists crew_activities_user on crew_activities (user_id, performed_at desc);
alter table crew_activities enable row level security;
create policy crew_activities_read on crew_activities for select to authenticated using (
  auth.uid() = user_id
  or (not crew_blocked(auth.uid(), user_id) and (
       visibility = 'everyone'
       or (visibility = 'followers' and crew_follows_active(auth.uid(), user_id))))
);
create policy crew_activities_ins on crew_activities for insert to authenticated with check (auth.uid() = user_id);
create policy crew_activities_upd on crew_activities for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy crew_activities_del on crew_activities for delete to authenticated using (auth.uid() = user_id);

create table if not exists crew_kudos (
  activity_id uuid not null references crew_activities(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (activity_id, user_id)
);
alter table crew_kudos enable row level security;
create policy crew_kudos_read on crew_kudos for select to authenticated using (
  exists (select 1 from crew_activities a where a.id = activity_id) and not crew_blocked(auth.uid(), user_id));
create policy crew_kudos_ins on crew_kudos for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from crew_activities a where a.id = activity_id));
create policy crew_kudos_del on crew_kudos for delete to authenticated using (auth.uid() = user_id);

create table if not exists crew_comments (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references crew_activities(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists crew_comments_act on crew_comments (activity_id, created_at);
alter table crew_comments enable row level security;
create policy crew_comments_read on crew_comments for select to authenticated using (
  exists (select 1 from crew_activities a where a.id = activity_id) and not crew_blocked(auth.uid(), user_id));
create policy crew_comments_ins on crew_comments for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from crew_activities a where a.id = activity_id));
-- Your own comment, or any comment on your own activity.
create policy crew_comments_del on crew_comments for delete to authenticated using (
  auth.uid() = user_id or exists (select 1 from crew_activities a where a.id = activity_id and a.user_id = auth.uid()));

-- Reports go in, nobody but the owner (via SQL) reads them.
create table if not exists crew_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('activity','comment','profile')),
  target_id   text not null,
  reason      text not null check (char_length(reason) between 1 and 500),
  created_at  timestamptz not null default now()
);
alter table crew_reports enable row level security;
create policy crew_reports_ins on crew_reports for insert to authenticated with check (auth.uid() = reporter_id);

-- The feed in one call. SECURITY INVOKER: the row policies above decide what
-- the caller may see. scope: 'following' (people I follow plus me),
-- 'base' (everyone at my base), 'all' (everyone visible to me),
-- 'user' (one person, p_user).
create or replace function crew_feed(p_scope text default 'following', p_user uuid default null, p_before timestamptz default null, p_limit int default 30)
returns table (
  id uuid, user_id uuid, callsign citext, base text, kind text, title text, muscle_group text, env text, airport text,
  miles numeric, seconds int, sets_logged int, note text, performed_at timestamptz, visibility text,
  kudos_count bigint, my_kudos boolean, comment_count bigint
)
language sql stable security invoker set search_path = public as $$
  select a.id, a.user_id, p.callsign, p.base, a.kind, a.title, a.muscle_group, a.env, a.airport,
         a.miles, a.seconds, a.sets_logged, a.note, a.performed_at, a.visibility,
         (select count(*) from crew_kudos k where k.activity_id = a.id) as kudos_count,
         exists (select 1 from crew_kudos k where k.activity_id = a.id and k.user_id = auth.uid()) as my_kudos,
         (select count(*) from crew_comments c where c.activity_id = a.id) as comment_count
  from crew_activities a
  join crew_profiles p on p.user_id = a.user_id
  where (p_before is null or a.performed_at < p_before)
    and case p_scope
          when 'following' then (a.user_id = auth.uid() or crew_follows_active(auth.uid(), a.user_id))
          when 'base' then (p.base is not null and p.base = (select base from crew_profiles where user_id = auth.uid()))
          when 'user' then a.user_id = p_user
          else true
        end
  order by a.performed_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Counts for a profile header, respecting blocks via the read policies.
create or replace function crew_profile_counts(p_user uuid)
returns table (followers bigint, following bigint, activities bigint, month_miles numeric)
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from crew_follows where followee_id = p_user and status = 'active'),
    (select count(*) from crew_follows where follower_id = p_user and status = 'active'),
    (select count(*) from crew_activities where user_id = p_user and visibility <> 'private'),
    (select coalesce(sum(miles), 0) from crew_activities where user_id = p_user and kind = 'run' and visibility <> 'private'
       and performed_at >= date_trunc('month', now()));
$$;

-- Members at a base this month: a club board without a club table.
create or replace function crew_base_board(p_base text)
returns table (user_id uuid, callsign citext, month_miles numeric, month_sessions bigint)
language sql stable security invoker set search_path = public as $$
  select p.user_id, p.callsign,
         coalesce(sum(case when a.kind = 'run' then a.miles end), 0) as month_miles,
         count(a.id) as month_sessions
  from crew_profiles p
  left join crew_activities a on a.user_id = p.user_id and a.performed_at >= date_trunc('month', now())
  where p.base = p_base and not crew_blocked(auth.uid(), p.user_id)
  group by p.user_id, p.callsign
  order by month_miles desc, month_sessions desc
  limit 50;
$$;

grant execute on function crew_feed(text, uuid, timestamptz, int) to authenticated;
grant execute on function crew_profile_counts(uuid) to authenticated;
grant execute on function crew_base_board(text) to authenticated;
grant execute on function crew_blocked(uuid, uuid) to authenticated;
grant execute on function crew_follows_active(uuid, uuid) to authenticated;

-- Oct 18 2026, second migration: leaving the crew (deleting crew_profiles)
-- removes everything the member put on the feed.
alter table crew_activities add constraint crew_activities_profile_fk foreign key (user_id) references crew_profiles(user_id) on delete cascade;
alter table crew_kudos add constraint crew_kudos_profile_fk foreign key (user_id) references crew_profiles(user_id) on delete cascade;
alter table crew_comments add constraint crew_comments_profile_fk foreign key (user_id) references crew_profiles(user_id) on delete cascade;
alter table crew_follows add constraint crew_follows_follower_fk foreign key (follower_id) references crew_profiles(user_id) on delete cascade;
alter table crew_follows add constraint crew_follows_followee_fk foreign key (followee_id) references crew_profiles(user_id) on delete cascade;
alter table crew_blocks add constraint crew_blocks_blocker_fk foreign key (blocker_id) references crew_profiles(user_id) on delete cascade;
alter table crew_blocks add constraint crew_blocks_blocked_fk foreign key (blocked_id) references crew_profiles(user_id) on delete cascade;

-- Oct 18 2026: owner dashboard (Super User page). Aggregates only; raises
-- for anyone but the owner's account.
-- (see migration admin_stats_for_owner; body kept in Supabase)

-- Oct 19 2026: crew_reports.dismissed_at. Owner dismisses a report instead
-- of deleting it; admin_stats counts only open (not dismissed) reports.
alter table crew_reports add column if not exists dismissed_at timestamptz;

-- Oct 21 2026: explicit Data API grants. Supabase stops auto-granting new
-- public tables on Oct 30 2026 (see sql/README.md). The live tables already
-- have these; they are here so a rebuild from this file works.
grant select on crew_profiles, crew_follows, crew_activities, crew_kudos, crew_comments, crew_blocks, crew_reports to anon;
grant select, insert, update, delete on crew_profiles, crew_follows, crew_activities, crew_kudos, crew_comments, crew_blocks, crew_reports to authenticated;
grant select, insert, update, delete on crew_profiles, crew_follows, crew_activities, crew_kudos, crew_comments, crew_blocks, crew_reports to service_role;

-- ── Photos on posts (Oct 26 2026) ────────────────────────────────────────
-- A member can attach up to 4 photos to one of their own posts (the gym, the
-- equipment). Files live in the public 'crew-photos' bucket under
-- <user_id>/<activity_id>/<random>.jpg; crew_photos rows tie them to the post.
-- Public bucket: a photo on a followers-only post is still reachable by anyone
-- who has its URL, so the client tells members not to post anything private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crew-photos', 'crew-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "crew photos public read" on storage.objects for select using (bucket_id = 'crew-photos');
create policy "crew photos own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'crew-photos' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "crew photos own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'crew-photos' and (auth.uid())::text = (storage.foldername(name))[1]);

create table if not exists crew_photos (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references crew_activities(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  path        text not null unique,
  created_at  timestamptz not null default now()
);
create index if not exists crew_photos_activity on crew_photos (activity_id, created_at);
alter table crew_photos enable row level security;
create policy crew_photos_read on crew_photos for select to authenticated using (
  exists (select 1 from crew_activities a where a.id = activity_id) and not crew_blocked((select auth.uid()), user_id));
-- The cap counts through a definer function: a policy that reads its own
-- table recurses ("infinite recursion detected in policy").
create or replace function crew_photo_count(p_activity uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from crew_photos where activity_id = p_activity;
$$;
revoke execute on function crew_photo_count(uuid) from anon;
grant execute on function crew_photo_count(uuid) to authenticated;
create policy crew_photos_ins on crew_photos for insert to authenticated with check (
  (select auth.uid()) = user_id
  and exists (select 1 from crew_activities a where a.id = activity_id and a.user_id = (select auth.uid()))
  and crew_photo_count(activity_id) < 4);
create policy crew_photos_del on crew_photos for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, delete on crew_photos to authenticated;
grant select, insert, update, delete on crew_photos to service_role;
