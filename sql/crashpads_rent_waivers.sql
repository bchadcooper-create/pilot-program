-- DFW Crashpads: rent waivers (Supabase project uvkkfkaqlhvmyacxwoey).
-- Migration cp_rent_waivers (2026-10-14).
-- A waiver row means the tenant owes nothing for that month and the bed stays theirs
-- (first use: Brian Nichols, RH-03, Nov 2026 off on vacation, rent resumes Dec).
-- Waivers are not payments, so they never show up in income totals.
create table if not exists public.cp_rent_waivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.cp_tenants(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  note text,
  created_at timestamptz not null default now(),
  unique (tenant_id, month)
);
alter table public.cp_rent_waivers enable row level security;
drop policy if exists manager_all on public.cp_rent_waivers;
create policy manager_all on public.cp_rent_waivers for all to authenticated
  using (public.cp_is_manager()) with check (public.cp_is_manager());

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
      exists (select 1 from public.cp_rent_waivers w where w.tenant_id = t.id and w.month = m.first) as waived,
      case when exists (select 1 from public.cp_rent_waivers w where w.tenant_id = t.id and w.month = m.first) then 0
           when t.move_in >= m.first and t.move_in <= m.last and t.first_month_due is not null
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
      when b.waived then 'waived'
      when b.paid_amt >= b.due then 'paid'
      when current_date > b.late_after and current_date >= (select first from m) then 'late'
      else 'due' end
  from base b
  order by b.bed_id nulls last, b.name;
$function$;
