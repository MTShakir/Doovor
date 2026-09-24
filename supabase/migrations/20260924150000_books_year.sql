-- A year's trading, gathered but not judged (MNY-04, D-198).
--
-- This counts things up and nothing more: what came in, what went out, what the provider kept and
-- how far the cars went. Turning that into a return, including what VAT registration does to it,
-- is done in packages/core, where it can be unit tested against a worked example. SQL that also
-- did the arithmetic would be arithmetic nobody could read back.
--
-- Cash basis: money counts on the day it moved, not the day it was earned.
create or replace function public.books_year(p_business_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_keeps_books(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 400 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "period"}';
  end if;

  -- The day starts and ends in London, so money taken at half past midnight on 6 April is in the
  -- new tax year even though it is still the 5th in UTC.
  v_from := (p_from::timestamp at time zone 'Europe/London');
  v_to := ((p_to + 1)::timestamp at time zone 'Europe/London');

  return jsonb_build_object(
    'vat_registered', (select b.vat_registered from public.businesses b where b.id = p_business_id),

    -- What came in, gross, on the day it arrived.
    'payments', (
      select jsonb_build_object(
               'total_pence', coalesce(sum(p.amount_pence), 0)::integer,
               'card_pence', coalesce(sum(p.amount_pence) filter (where p.method = 'card'), 0)::integer,
               'count', count(*)::integer)
        from public.payments p
       where p.business_id = p_business_id
         and p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= v_from and p.paid_at < v_to
    ),

    -- What went back out to learners, on the day it went.
    'refunds', (
      select jsonb_build_object(
               'total_pence', coalesce(sum(r.amount_pence), 0)::integer,
               'count', count(*)::integer)
        from public.refunds r
       where r.business_id = p_business_id
         and r.status = 'succeeded'
         and r.settled_at >= v_from and r.settled_at < v_to
    ),

    -- What the payments provider kept out of the money before it arrived. Null fees are ones
    -- nobody has asked about yet, and are counted as nothing here but reported separately so a
    -- screen can say the figure is still settling.
    'provider_fees', (
      select jsonb_build_object(
               'total_pence', coalesce(sum(p.provider_fee_pence), 0)::integer,
               'unknown_count', count(*) filter (where p.provider_fee_pence is null and p.method = 'card')::integer)
        from public.payments p
       where p.business_id = p_business_id
         and p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= v_from and p.paid_at < v_to
    ),

    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'category', e.category,
               'total_pence', e.total_pence,
               'vat_pence', e.vat_pence,
               'count', e.count)
             order by e.category)
        from (
          select category, sum(amount_pence)::integer as total_pence, sum(vat_pence)::integer as vat_pence,
                 count(*)::integer as count
            from public.expenses
           where business_id = p_business_id and spent_on between p_from and p_to
           group by category
        ) e
    ), '[]'::jsonb),

    -- Only the cars claimed by the mile. One on actual costs has its costs in the expenses above,
    -- and counting its miles as well would claim the same car twice.
    'mileage', (
      select jsonb_build_object(
               'tenths', coalesce(sum(m.miles_tenths), 0)::integer,
               'trips', count(*)::integer)
        from public.mileage_log m
        join public.vehicles v on v.id = m.vehicle_id
       where m.business_id = p_business_id
         and m.travelled_on between p_from and p_to
         and v.claim_method = 'mileage'
    )
  );
end;
$$;

revoke all on function public.books_year(uuid, date, date) from public, anon;
grant execute on function public.books_year(uuid, date, date) to authenticated;
