-- DFW Crashpads: rent owed per tenant for a month (Supabase project uvkkfkaqlhvmyacxwoey).
-- Applied 2026-10-12 as migration cp_rent_for_month_prorate_move_in.
-- Move-in month is prorated per the agreement: monthly rent / 30 per day, move-in date through month end,
-- capped at the monthly rent, and due on the move-in date (late after max(move-in, the 5th)).
-- `rent` in the result is the amount due for that month, not the monthly rate.
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
      case when t.move_in > m.first and t.move_in <= m.last
           then least(t.rent, round(t.rent * ((m.last - t.move_in) + 1) / 30.0))::int
           else t.rent end as due,
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
