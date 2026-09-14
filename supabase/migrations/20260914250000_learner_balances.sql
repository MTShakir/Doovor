-- A learner's balance with a Business, the same for everybody who may see it (PAY-05, PAY-06,
-- LRN-02, M3-16).
--
-- The learner sees their balance on Payments and their instructor sees it on the learner card,
-- and the two have to say the same thing. Read through row-level security they would not: a
-- school instructor sees only their own lessons, so a lesson the learner owes a colleague for
-- would be missing from one screen and not the other. So the facts come from one function that
-- decides who may ask and then reads all of them: the learner themself, the owners and managers
-- of the Business, the instructor who teaches the learner, and platform staff (D-090). What is
-- owed and what is overdue is then worked out from those facts in packages/core/src/balance.ts,
-- once, for both screens.
--
-- A package paid for in person is recorded from the learner card, as a lesson paid in person is
-- from the diary (M3-15): the payment and the lot of credit it buys, together.

/**
 * The facts a balance is worked out from: credit to book with, lessons that could be owed for,
 * and the recent history of the learner's money with the Business.
 */
create or replace function public.learner_balance(p_business_id uuid, p_learner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not (
    p_learner_id = v_user
    or p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or exists (
      select 1 from private.auth_instructor_learners() as taught
       where taught.business_id = p_business_id
         and taught.learner_id = p_learner_id
    )
    or private.auth_is_staff()
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'credit_minutes', coalesce((
      select sum(l.minutes_remaining)::integer
        from public.credit_lots l
       where l.business_id = p_business_id
         and l.learner_id = p_learner_id
         and l.minutes_remaining > 0
         and (l.expires_at is null or l.expires_at > now())
    ), 0),

    -- Lessons that could be owed for. Which of them are, and since when, is decided in core.
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'starts_at', b.starts_at,
               'ends_at', b.ends_at,
               'status', b.status,
               'payment_status', b.payment_status,
               'payment_mode', b.payment_mode,
               'price_pence', b.price_pence,
               'instructor_id', b.instructor_id,
               'instructor_name', i.display_name
             ) order by b.starts_at)
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
       where b.business_id = p_business_id
         and b.learner_id = p_learner_id
         and b.status in ('confirmed', 'in_progress', 'completed')
         and b.payment_status in ('unpaid', 'pending', 'failed')
         and b.price_pence > 0
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          select p.id, coalesce(p.paid_at, p.created_at) as at, p.amount_pence, p.method, p.refunded_pence,
                 b.starts_at as lesson_at, l.minutes_total as credit_minutes
            from public.payments p
            left join public.bookings b on b.id = p.booking_id
            left join public.credit_lots l on l.payment_id = p.id
           where p.business_id = p_business_id
             and p.learner_id = p_learner_id
             and p.status in ('paid', 'refunded', 'partially_refunded')
           order by coalesce(p.paid_at, p.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    'refunds', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          select r.id, coalesce(r.settled_at, r.created_at) as at, r.amount_pence, r.status
            from public.refunds r
           where r.business_id = p_business_id
             and r.learner_id = p_learner_id
           order by coalesce(r.settled_at, r.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    -- What happened to credit other than buying it, which is a payment above.
    'credit', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          select m.id, m.created_at as at, m.kind as move, m.minutes, b.starts_at as lesson_at
            from public.credit_ledger m
            left join public.bookings b on b.id = m.booking_id
           where m.business_id = p_business_id
             and m.learner_id = p_learner_id
             and m.kind <> 'purchase'
           order by m.created_at desc
           limit 50
        ) as recent
    ), '[]'::jsonb)
  );
end;
$$;

/**
 * Records a package paid for in person, in cash or by bank transfer (PAY-04, PAY-05): the payment
 * and the lot of credit it buys. By the owners and managers of the Business, or the instructor who
 * teaches the learner. Bought face to face, so the fourteen days to cancel a distance sale in do
 * not apply (D-086). Returns the lot.
 */
create or replace function public.record_offline_package(p_learner_id uuid, p_package_id uuid, p_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_package public.packages;
  v_payment_id uuid;
  v_lot_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash', 'bank') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "method"}';
  end if;

  select * into v_package from public.packages where id = p_package_id;
  if v_package.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if not (
    v_package.business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or exists (
      select 1 from private.auth_instructor_learners() as taught
       where taught.business_id = v_package.business_id
         and taught.learner_id = p_learner_id
    )
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.learner_relationships
     where business_id = v_package.business_id
       and learner_id = p_learner_id
  ) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not v_package.is_active then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "package"}';
  end if;
  if v_package.price_pence <= 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "price"}';
  end if;

  insert into public.payments (business_id, learner_id, payer_id, provider, amount_pence, method, status, paid_at)
  values (v_package.business_id, p_learner_id, p_learner_id, 'offline', v_package.price_pence,
          p_method::public.payment_method, 'paid', now())
  returning id into v_payment_id;

  v_lot_id := private.add_credit_lot(
    v_package.business_id,
    p_learner_id,
    v_package.minutes,
    v_package.price_pence,
    v_payment_id,
    v_package.id,
    case when v_package.expiry_days is null then null else now() + make_interval(days => v_package.expiry_days) end,
    null,
    v_user
  );

  perform private.write_audit('credit.purchased', 'credit_lot', v_lot_id, v_package.business_id, null,
    jsonb_build_object('payment_id', v_payment_id, 'package_id', v_package.id, 'minutes', v_package.minutes,
                       'amount_pence', v_package.price_pence, 'method', p_method));
  perform private.enqueue_event('payment.received',
    jsonb_build_object('payment_id', v_payment_id, 'lot_id', v_lot_id));

  return v_lot_id;
end;
$$;

revoke all on function public.learner_balance(uuid, uuid) from public, anon;
revoke all on function public.record_offline_package(uuid, uuid, text) from public, anon;
grant execute on function public.learner_balance(uuid, uuid) to authenticated;
grant execute on function public.record_offline_package(uuid, uuid, text) to authenticated;
