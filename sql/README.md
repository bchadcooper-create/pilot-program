# SQL notes

## Rule: every new table in `public` needs explicit grants (from Oct 30, 2026)

Supabase stops auto-granting Data API access to NEW tables in the `public`
schema on October 30, 2026 (email to Chad, Oct 21 2026). Existing tables keep
their grants. A new table without grants makes supabase-js return
"permission denied", which in this app shows up as a silent timeout or an
empty card.

So every migration that creates a table in `public` ends with the grants for
it, in the same migration. Row level security still decides which rows each
user sees; the grants only let the API reach the table at all.

```sql
create table public.example ( ... );
alter table public.example enable row level security;
-- policies here

grant select on public.example to anon;
grant select, insert, update, delete on public.example to authenticated;
grant select, insert, update, delete on public.example to service_role;
```

Drop the `anon` line for tables only signed-in members use, and drop both
`anon` and `authenticated` for server-only tables (the fb_connector tables
in the DFW project are service-role only on purpose).

Views (for example `cp_bed_status`) need the same grants.

## Grant state on Oct 21, 2026 (checked by query)

- pilot-program (dnxkydxbyihgsictbzjz): all 26 public tables reachable by
  anon, authenticated and service_role, all with RLS on.
- the-destroying-angels / DFW Crashpads (uvkkfkaqlhvmyacxwoey): 21 public
  tables and views. content_queue, fb_connector_config and fb_connector_pages
  are service-role only by design; the rest are reachable by all three roles.
  cp_bed_status is a security_invoker view, so the RLS of its tables applies.

If a schema is ever rebuilt from these files (new project, branch, or
`supabase db reset`), run the grants for each table after creating it.

## Database review, Oct 21 2026 (FCF project)

Found and fixed, all verified by running the app's own queries as a signed-in
member and as a signed-out visitor, plus the medical and crew browser tests:

- `workout_sessions` had a policy "allow anonymous inserts" with no condition:
  anyone holding the public key could insert rows under any user's id. Made
  inert (`with check (false)`). One junk row with no user remains.
- Every policy now applies to `authenticated` only (the app requires sign-in)
  and uses `(select auth.uid())` so Postgres evaluates it once per query.
  Done with ALTER POLICY, which the MCP tool allows; DROP is blocked.
- Boards (leaderboard_entries, running_log, running_pr_entries) are no longer
  readable by signed-out visitors.
- `admin_stats`, the crew helpers, `dots_score`, `safe_int`, `safe_numeric`:
  execute revoked from `anon`.
- Indexes added: crew_blocks(blocked_id), crew_follows(followee_id, status),
  crew_comments(user_id), crew_kudos(user_id), crew_reports(reporter_id),
  workout_sessions(user_id, started_at desc), weight_log(user_id, logged_at desc).
- `citext` moved from `public` to `extensions`. Lesson: PostgREST kept its old
  schema cache for several minutes and crew joins failed until
  `notify pgrst, 'reload schema'` ran. Always send that after moving an
  extension or changing a type.

Still open, needs a DROP the tool will not run (Chad, in the dashboard SQL
editor, or approve the confirmation when Claude tries):

```sql
drop policy "allow anonymous inserts" on public.workout_sessions;
drop policy "admin can read all sessions" on public.workout_sessions;
drop index public.idx_workout_sessions_user_id;
drop index public.idx_weight_log_user_id;
delete from public.workout_sessions where user_id is null;
```

Also needs Chad: Supabase dashboard, Authentication, Settings, turn on
"Leaked password protection" (checks new passwords against HaveIBeenPwned).
