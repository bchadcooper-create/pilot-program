-- Find a crew member by their full email address (Chad, Nov 27 2026: "Can we
-- search by phone number or email too?" Email yes; the app stores no phone
-- numbers).
-- Exact match only, so nobody can browse members' emails by typing part of
-- one. The email is never returned: only the same columns the call sign
-- search shows. Members who have not joined the crew feed, the caller
-- themself, and anyone blocked in either direction are not returned.
-- security definer: auth.users is not readable by app users.
create or replace function crew_find_by_email(p_email text)
returns table (user_id uuid, callsign citext, base text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.callsign, p.base, p.avatar_path
  from auth.users u
  join crew_profiles p on p.user_id = u.id
  where auth.uid() is not null
    and position('@' in coalesce(p_email, '')) > 1
    and lower(u.email) = lower(btrim(p_email))
    and u.id <> auth.uid()
    and not crew_blocked(auth.uid(), u.id)
  limit 1;
$$;

revoke all on function crew_find_by_email(text) from public, anon;
grant execute on function crew_find_by_email(text) to authenticated;
