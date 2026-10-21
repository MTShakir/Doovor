-- A fee paid is named as the fee it is (PAY-06, MNY-01, R-08, R-09, D-323).
--
-- A late cancellation fee paid on its own showed in the payment history as "Lesson on Thu 22 Oct"
-- and on the Money screen as a lesson: the lesson never happened, and the money was the fee. Each
-- payment now says when it paid a fee: one for a lesson called off late or missed, of the fee's
-- own amount. A lesson paid for before it was called off is still the lesson, with what was given
-- back beside it.
--
-- Both functions are otherwise as their newest definitions made them, which
-- scripts/latest-function.mjs found: learner_balance in 20260929140000_credit_first_then_the_rest,
-- money_transactions in 20260924100000_money_transactions.

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
    raise exception 'NOT_FOUND' using errcode = '42501';
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

    -- Lessons that could be owed for, and lessons called off late or nobody came to whose fee
    -- nobody has paid.
    -- Which of them are owed, and since when, is decided in core.
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'starts_at', b.starts_at,
               'ends_at', b.ends_at,
               'status', b.status,
               'payment_status', b.payment_status,
               'payment_mode', b.payment_mode,
               'price_pence', b.price_pence,
               -- What credit already covered of it, so what is owed is the rest (D-225).
               'credit_minutes', b.credit_minutes,
               'fee_pence', coalesce(b.fee_pence, 0),
               'cancelled_at', b.cancelled_at,
               'instructor_id', b.instructor_id,
               'instructor_name', i.display_name
             ) order by b.starts_at)
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
       where b.business_id = p_business_id
         and b.learner_id = p_learner_id
         and (
           (b.status in ('confirmed', 'in_progress', 'completed')
            and b.payment_status in ('unpaid', 'pending', 'failed')
            and b.price_pence > 0)
           or (b.status in ('cancelled', 'no_show')
               and coalesce(b.fee_pence, 0) > 0
               and b.payment_status in ('unpaid', 'failed'))
         )
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          -- What is on its way back or owed back already, so nobody is offered a refund of nothing.
          select p.id, coalesce(p.paid_at, p.created_at) as at, p.amount_pence, p.method, p.refunded_pence,
                 (select coalesce(sum(r.amount_pence), 0)::integer
                    from public.refunds r
                   where r.payment_id = p.id and r.status = 'pending') as pending_refund_pence,
                 b.starts_at as lesson_at, l.minutes_total as credit_minutes,
                 exists (select 1 from public.receipts r where r.payment_id = p.id) as has_receipt,
                 -- A fee for a lesson called off late, or nobody came to, paid as itself (D-323).
                 case when b.status in ('cancelled', 'no_show') and coalesce(b.fee_pence, 0) > 0
                       and p.amount_pence = b.fee_pence then b.status::text end as fee_for
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
          -- The lesson it was for, and whose it was: cash owed back is handed back by them (M3-18).
          select r.id, coalesce(r.settled_at, r.created_at) as at, r.amount_pence, r.status, r.kind,
                 b.starts_at as lesson_at, b.instructor_id
            from public.refunds r
            left join public.bookings b on b.id = r.booking_id
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

create or replace function public.money_transactions(p_business_id uuid, p_limit integer, p_offset integer)
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
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- A page, not a download: the screen asks for a handful at a time and nothing else may.
  if p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 or p_offset > 2000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "page"}';
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
  v_revenue := not v_whole or private.auth_has_permission(p_business_id, 'view_revenue') or private.auth_is_staff();
  if not v_revenue then
    return null;
  end if;

  with everything as (
    select p.id,
           coalesce(p.paid_at, p.created_at) as at,
           'payment' as kind,
           p.amount_pence,
           p.learner_id,
           u.full_name as learner_name,
           p.method::text as method,
           p.refunded_pence,
           null::text as refund_kind,
           null::text as status,
           b.starts_at as lesson_at,
           (select l.minutes_total from public.credit_lots l where l.payment_id = p.id limit 1) as credit_minutes,
           -- A fee for a lesson called off late, or nobody came to, paid as itself (D-323).
           case when b.status in ('cancelled', 'no_show') and coalesce(b.fee_pence, 0) > 0
                 and p.amount_pence = b.fee_pence then b.status::text end as fee_for
      from public.payments p
      join public.users u on u.id = p.learner_id
      left join public.bookings b on b.id = p.booking_id
     where p.business_id = p_business_id
       and p.status in ('paid', 'partially_refunded', 'refunded')
       and (v_whole or b.instructor_id = any (v_mine))
    union all
    -- Money going back is a transaction too, and one still waiting to be handed over says so.
    select r.id,
           coalesce(r.settled_at, r.created_at),
           'refund',
           r.amount_pence,
           r.learner_id,
           u.full_name,
           null,
           0,
           r.kind::text,
           r.status::text,
           b.starts_at,
           null,
           null
      from public.refunds r
      join public.users u on u.id = r.learner_id
      left join public.bookings b on b.id = r.booking_id
     where r.business_id = p_business_id
       and r.status in ('succeeded', 'pending')
       and (v_whole or b.instructor_id = any (v_mine))
  ),
  -- One more than asked for, which is how the screen knows whether to offer another page.
  page as (
    select * from everything order by at desc, id desc offset p_offset limit p_limit + 1
  )
  select jsonb_build_object(
           'more', (select count(*) from page) > p_limit,
           'rows', coalesce(
             (select jsonb_agg(to_jsonb(shown) order by shown.at desc, shown.id desc)
                from (select * from page order by at desc, id desc limit p_limit) shown),
             '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;
