-- What the platform itself earns (ADM-01, ADM-10, D-174).
--
-- The product owner asked for a Payments screen showing what schools and instructors pay the
-- platform, rather than the lessons they sell. Today that is the fee taken on a card payment: the
-- application fee on a Business's own Stripe payment (PAY-01). Plan subscriptions are not charged
-- yet, so the screen says how many Businesses are on each plan and leaves the money at nothing
-- until plan billing arrives (ADM-10).
--
--   fees:        what the platform kept from payments settled in the range, and the money those
--                payments moved, so a rate can be seen at a glance.
--   by_business: who paid it, most first, with the plan they are on. Staff cannot read a plan from
--                the table itself (D-123); this function may, because it checks who is asking.
--   plans:       how many Businesses in good standing are on each plan now, whatever the range.

create or replace function private.platform_income_facts(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with span as (
    select p_from as from_at, p_to as to_at
  ),
  taken as (
    select p.business_id, p.fee_pence, p.amount_pence
      from public.payments p
      cross join span s
     where p.status in ('paid', 'partially_refunded', 'refunded')
       and p.method <> 'credit'
       and p.paid_at >= s.from_at and p.paid_at < s.to_at
  ),
  fees as (
    select coalesce(sum(t.fee_pence), 0)::bigint as pence,
           count(*) filter (where t.fee_pence > 0)::integer as payments,
           coalesce(sum(t.amount_pence) filter (where t.fee_pence > 0), 0)::bigint as on_pence
      from taken t
  ),
  by_business as (
    select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'type', x.type, 'plan', x.plan,
                                        'pence', x.pence, 'payments', x.payments)
                     order by x.pence desc, x.name) as rows
      from (
        select b.id, b.name, b.type, b.plan, sum(t.fee_pence)::bigint as pence, count(*)::integer as payments
          from taken t
          join public.businesses b on b.id = t.business_id
         where t.fee_pence > 0
         group by b.id, b.name, b.type, b.plan
         order by sum(t.fee_pence) desc, b.name
         limit 25
      ) x
  ),
  plans as (
    select jsonb_agg(jsonb_build_object('plan', x.plan, 'businesses', x.businesses) order by x.plan) as rows
      from (
        select b.plan::text as plan, count(*)::integer as businesses
          from public.businesses b
         where b.status = 'active'
         group by b.plan
      ) x
  )
  select jsonb_build_object(
    'fees', (select jsonb_build_object('pence', f.pence, 'payments', f.payments, 'on_pence', f.on_pence) from fees f),
    'by_business', coalesce((select b.rows from by_business b), '[]'::jsonb),
    'plans', coalesce((select p.rows from plans p), '[]'::jsonb)
  );
$$;

revoke all on function private.platform_income_facts(timestamptz, timestamptz) from public, anon, authenticated;

/** What the platform earned over a range, for platform staff past their second step (ADM-01, AUTH-08). */
create or replace function public.platform_income(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '5 years' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "range"}';
  end if;
  return private.platform_income_facts(p_from, p_to);
end;
$$;

revoke all on function public.platform_income(timestamptz, timestamptz) from public, anon;
grant execute on function public.platform_income(timestamptz, timestamptz) to authenticated;
