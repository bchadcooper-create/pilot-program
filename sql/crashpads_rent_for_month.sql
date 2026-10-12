-- DFW Crashpads: rent owed per tenant for a month (Supabase project uvkkfkaqlhvmyacxwoey).
-- Current version: migration cp_tenants_first_month_due_optional (2026-10-12).
-- Proration is optional per tenant: cp_tenants.first_month_due is what they owe for the move-in month
-- (the app's Prorate button fills rent / 30 per day); blank means the full monthly rent.
-- The move-in month is due on the move-in date (late after max(move-in, the 5th)).
-- `rent` in the result is the amount due for that month, not the monthly rate.
alter table public.cp_tenants add column if not exists first_month_due integer;

CREATE OR REPLACE FUNCTION public.cp_rent_for_month(p_month date)
 RETURNS TABLE(tenant_id uuid, name text, bed_id text, status text, rent integer, move_in date, move_out date, paid numeric, owed numeric, rent_status text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  with m as (
    select date_trunc('month', p_month)::date as first,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as last
  ),
  base as (
    select t.*,
      case when t.move_in >= m.first and t.move_in <= m.last and t.first_month_due is not null
           then t.first_month_due else t.rent end as due,
      case when t.move_in > m.first and t.move_in <= m.last
           then greatest(t.move_in, m.first + 4) else m.first + 4 end as late_after,
      coalesce((select sum(p.amount) from public.cp_payments p
                where p.tenant_id = t.id and p.type in ('Rent','Late fee')
                  and p.for_month >= m.first and p.for_month <= m.last), 0) as paid_amt
    from public.cp_tenants t, m
    where t.status in ('Active','Reserved')
       or (t.status = 'Moved Out' and t.move_out >= m.first)
  )
  select b.id, b.name, b.bed_id, b.status, b.due, b.move_in, b.move_out,
    b.paid_amt, greatest(b.due - b.paid_amt, 0),
    case
      when b.status = 'Moved Out' and (b.move_out is null or b.move_out < (select first from m)) then 'n/a'
      when b.move_in is not null and b.move_in > (select last from m) then 'not started'
      when b.paid_amt >= b.due then 'paid'
      when current_date > b.late_after and current_date >= (select first from m) then 'late'
      else 'due' end
  from base b
  order by b.bed_id nulls last, b.name;
$function$;

-- ---------------------------------------------------------------------------
-- Average nightly (migration cp_lock_nightly, 2026-10-12): see cp_lock_nightly
-- (backfill from TTLock unlock records, 2026-04-11 to 2026-10-11) and
-- cp_nightly_by_month(), which adds live days from cp_lock_events.
-- Exclusions (housekeeping, owner, family) live in cp_settings 'nightly_exclude'.
