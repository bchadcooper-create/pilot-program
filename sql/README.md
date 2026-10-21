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
