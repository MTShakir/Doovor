-- Payouts and billing are the owner's (PRD 6.2, acceptance test 11, M5-16).
--
-- A school's managers run its diary, its learners and its instructors, but never see where its
-- money is paid out or what it pays the platform, and see what it takes only when the owner allows
-- (view_revenue, D-120). Until now any member could read the payout and plan columns of their
-- Business, and the Money screen asked the payments provider about the account for whoever opened
-- it. Those columns are now readable by nobody signed in; the owner reads them through functions
-- that check first (D-123).

-- ---------------------------------------------------------------------------------------
-- The columns anybody who may see a Business reads. A column added later is private until it is
-- granted here too.
-- ---------------------------------------------------------------------------------------
revoke select on public.businesses from authenticated;
grant select (
  id, type, name, slug, logo_url, base_postcode, base_location, address, timezone, vat_number, settings, status,
  created_by, created_at, updated_at, stripe_account_id, stripe_charges_enabled, expected_instructors, onboarding_completed_at
) on public.businesses to authenticated;

-- ---------------------------------------------------------------------------------------
-- payments_account: the payments account and its payouts, for the owner and platform super admins.
-- ---------------------------------------------------------------------------------------
create or replace function public.payments_account(p_business_id uuid)
returns table (account_id text, charges_enabled boolean, payouts_enabled boolean, details_submitted boolean, connected_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not (private.auth_has_permission(p_business_id, 'manage_billing') or private.auth_is_staff('super')) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
    select b.stripe_account_id, b.stripe_charges_enabled, b.stripe_payouts_enabled, b.stripe_details_submitted, b.stripe_connected_at
      from public.businesses b
     where b.id = p_business_id;
end;
$$;

revoke all on function public.payments_account(uuid) from public, anon;
grant execute on function public.payments_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- business_billing: the plan a Business is on, for the same people.
-- ---------------------------------------------------------------------------------------
create or replace function public.business_billing(p_business_id uuid)
returns table (plan public.plan_key, plan_expires_at timestamptz, founding_offer boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not (private.auth_has_permission(p_business_id, 'manage_billing') or private.auth_is_staff('super')) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
    select b.plan, b.plan_expires_at, b.founding_offer
      from public.businesses b
     where b.id = p_business_id;
end;
$$;

revoke all on function public.business_billing(uuid) from public, anon;
grant execute on function public.business_billing(uuid) to authenticated;

/**
 * Money over a period, for one Business (MNY-01), as before (M3-21), except that the money taken
 * (paid, credit sold and refunds) is null for somebody running the Business who may not see its
 * revenue: a manager the owner has not allowed (PRD 6.2). What is unpaid stays, because chasing
 * it is part of running the diary.
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
  v_revenue boolean;
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
  -- An instructor sees what their own lessons took; the whole Business's takings need the permission.
  v_revenue := not v_whole or private.auth_has_permission(p_business_id, 'view_revenue') or private.auth_is_staff();

  return jsonb_build_object(
    'whole_business', v_whole,

    'paid', case when v_revenue then (
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
    ) end,

    'credit_sold', case when v_whole and v_revenue then (
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

    'refunds', case when v_revenue then (
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
    ) end,

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
