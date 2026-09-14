-- The money dashboard (MNY-01, M3-21).
--
-- What a Business took, is owed, sold as credit and gave back, over a period the screen asks for:
-- this week, this month or this tax year, worked out in packages/core/src/money-periods.ts. One
-- function reads it all and checks who is asking first. The owners and managers see the whole
-- Business; an instructor who does not run it sees their own lessons only, and no credit sold,
-- which belongs to the Business rather than to a lesson (ARCHITECTURE 8.6).

/**
 * Money over a period, for one Business (MNY-01).
 *
 *   paid: money received for lessons and fees, by how it was paid.
 *   credit_sold: packages bought, in money and minutes. Whole Business only.
 *   refunds: money that went back, card and in person. Credit given back as credit is not money.
 *   unpaid: lessons in the period that have started and are not paid, and fees owed for lessons
 *           called off late or nobody came to.
 */
create or replace function public.money_summary(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_whole boolean;
  v_mine uuid[];
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "period"}';
  end if;

  v_whole := p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
             or private.auth_is_staff();
  if not v_whole then
    select coalesce(array_agg(i.id), array[]::uuid[])
      into v_mine
      from public.instructor_profiles i
     where i.business_id = p_business_id
       and i.id in (select private.auth_instructor_ids());
    if cardinality(v_mine) = 0 then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;

  return jsonb_build_object(
    'whole_business', v_whole,

    'paid', (
      select jsonb_build_object(
               'total_pence', coalesce(sum(p.amount_pence), 0)::integer,
               'card_pence', coalesce(sum(p.amount_pence) filter (where p.method = 'card'), 0)::integer,
               'cash_pence', coalesce(sum(p.amount_pence) filter (where p.method = 'cash'), 0)::integer,
               'bank_pence', coalesce(sum(p.amount_pence) filter (where p.method = 'bank'), 0)::integer,
               'count', count(*)::integer)
        from public.payments p
        left join public.bookings b on b.id = p.booking_id
       where p.business_id = p_business_id
         and p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= p_from and p.paid_at < p_to
         and not exists (select 1 from public.credit_lots l where l.payment_id = p.id)
         and (v_whole or b.instructor_id = any (v_mine))
    ),

    'credit_sold', case when v_whole then (
      select jsonb_build_object(
               'total_pence', coalesce(sum(p.amount_pence), 0)::integer,
               'minutes', coalesce(sum(l.minutes_total), 0)::integer,
               'count', count(*)::integer)
        from public.payments p
        join public.credit_lots l on l.payment_id = p.id
       where p.business_id = p_business_id
         and p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= p_from and p.paid_at < p_to
    ) end,

    'refunds', (
      select jsonb_build_object(
               'total_pence', coalesce(sum(r.amount_pence), 0)::integer,
               'count', count(*)::integer)
        from public.refunds r
        left join public.bookings b on b.id = r.booking_id
       where r.business_id = p_business_id
         and r.status = 'succeeded'
         and r.kind in ('card', 'offline')
         and r.settled_at >= p_from and r.settled_at < p_to
         and (v_whole or b.instructor_id = any (v_mine))
    ),

    'unpaid', (
      select jsonb_build_object(
               'total_pence', coalesce(sum(case when b.status in ('cancelled', 'no_show') then b.fee_pence else b.price_pence end), 0)::integer,
               'count', count(*)::integer)
        from public.bookings b
       where b.business_id = p_business_id
         and b.starts_at >= p_from and b.starts_at < p_to
         and b.starts_at <= now()
         and (
           (b.status in ('confirmed', 'in_progress', 'completed')
            and b.payment_status in ('unpaid', 'pending', 'failed')
            and b.price_pence > 0
            and b.payment_mode <> 'credit')
           or (b.status in ('cancelled', 'no_show')
               and coalesce(b.fee_pence, 0) > 0
               and b.payment_status in ('unpaid', 'failed'))
         )
         and (v_whole or b.instructor_id = any (v_mine))
    )
  );
end;
$$;

revoke all on function public.money_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.money_summary(uuid, timestamptz, timestamptz) to authenticated;
