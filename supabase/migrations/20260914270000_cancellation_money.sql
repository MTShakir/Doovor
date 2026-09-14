-- What calling a lesson off does to the money paid for it (PAY-09, R-06, R-07, R-08, M3-18,
-- acceptance-04, acceptance-05).
--
-- Credit already went back, less any fee (20260914230000). Now money does too. When the learner
-- cancels late the Business keeps the fee its policy sets (R-06) and gives back the rest; cancelled
-- in time, or by the instructor or the Business, everything paid goes back (R-08).
--
--   Paid by card: whatever the fee does not keep goes back to the card, through the refund job.
--   Paid in cash or by bank transfer: it is written down as owed back, and whoever hands it back
--   marks it done from the learner card.
--   Not paid at all: a late fee is owed like a lesson is, and shows in the balance (PAY-06).
--
-- The cancellation event carries the policy it was cancelled under and what came of it, so the
-- email the learner gets can say why a fee was kept (acceptance-04).
--
-- Only a lesson that is on can be cancelled late: a request or a held slot is let go for nothing.
--
-- cancel_booking is the function from 20260914230000, learner_balance the one from 20260914250000
-- and record_offline_payment the one from 20260914240000, each with this added.

/**
 * Gives back what was paid for a cancelled lesson, less the fee, oldest payment first; the fee
 * is kept from the first money paid. Returns how much went back to cards, how much is owed back
 * in person, and how much was kept.
 */
create or replace function private.settle_cancelled_payments(
  p_booking_id uuid,
  p_fee_pence integer,
  p_actor_id uuid,
  p_why text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_fee_left integer := greatest(coalesce(p_fee_pence, 0), 0);
  v_refundable integer;
  v_keep integer;
  v_give integer;
  v_kind public.refund_kind;
  v_refund_id uuid;
  v_card integer := 0;
  v_offline integer := 0;
  v_kept integer := 0;
begin
  for v_payment in
    select * from public.payments
     where booking_id = p_booking_id
       and status in ('paid', 'partially_refunded')
     order by paid_at nulls last, created_at
       for update
  loop
    select v_payment.amount_pence - v_payment.refunded_pence - coalesce(sum(r.amount_pence), 0)::integer
      into v_refundable
      from public.refunds r
     where r.payment_id = v_payment.id
       and r.status = 'pending';
    continue when v_refundable <= 0;

    v_keep := least(v_refundable, v_fee_left);
    v_fee_left := v_fee_left - v_keep;
    v_kept := v_kept + v_keep;
    v_give := v_refundable - v_keep;
    continue when v_give <= 0;

    v_kind := (case when v_payment.method = 'card' then 'card' else 'offline' end)::public.refund_kind;
    insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, provider, amount_pence,
                                reason, requested_by)
    values (v_payment.business_id, v_payment.id, p_booking_id, v_payment.learner_id, v_kind,
            case when v_payment.method = 'card' then 'stripe' else 'offline' end, v_give, p_why, p_actor_id)
    returning id into v_refund_id;

    perform private.write_audit('refund.issued', 'refund', v_refund_id, v_payment.business_id, null,
      jsonb_build_object('payment_id', v_payment.id, 'booking_id', p_booking_id, 'amount_pence', v_give,
                         'automatic', true, 'why', 'cancelled'));

    if v_payment.method = 'card' then
      v_card := v_card + v_give;
      perform private.enqueue_event('payment.refund',
        jsonb_build_object('refund_id', v_refund_id, 'payment_id', v_payment.id, 'booking_id', p_booking_id));
    else
      v_offline := v_offline + v_give;
    end if;
  end loop;

  return jsonb_build_object('card_refund_pence', v_card, 'offline_refund_pence', v_offline, 'kept_pence', v_kept);
end;
$$;

revoke all on function private.settle_cancelled_payments(uuid, integer, uuid, text) from public, anon, authenticated;

/**
 * Money owed back in person, marked as handed back (M3-18): by the instructor who taught the
 * lesson, who is usually the one holding the cash, or by the owners and managers.
 */
create or replace function public.settle_offline_refund(p_refund_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
  v_instructor uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null or v_refund.kind::text <> 'offline' then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  select instructor_id into v_instructor from public.bookings where id = v_refund.booking_id;
  if not (
    private.auth_can_refund(v_refund.business_id)
    or (v_instructor is not null
        and exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_instructor))
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_refund.status <> 'pending' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  perform private.write_audit('refund.handed_back', 'refund', p_refund_id, v_refund.business_id, null,
    jsonb_build_object('amount_pence', v_refund.amount_pence));
  return public.system_settle_refund(p_refund_id, null, 'succeeded');
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Calling a lesson off.
-- ---------------------------------------------------------------------------------------

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_rules jsonb;
  v_window integer;
  v_percent integer;
  v_by text;
  v_late boolean;
  v_fee integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_credit jsonb := jsonb_build_object('returned', 0, 'kept', 0);
  v_money jsonb;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id) then
    v_by := 'instructor';
  elsif private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    v_by := 'business';
  elsif v_booking.learner_id = v_user then
    v_by := 'learner';
  else
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_booking.status not in ('requested', 'pending_payment', 'confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  -- An instructor calling a lesson off has to say why: the learner is told (R-08).
  if v_by in ('instructor', 'business') and v_reason is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  v_rules := private.booking_rules(v_booking.instructor_id);
  v_window := coalesce((v_rules ->> 'cancellation_window_hours')::int, 48);
  v_percent := coalesce((v_rules ->> 'late_fee_percent')::int, 100);
  -- Only a lesson that is on can be cancelled late. A request nobody has accepted, or a slot held
  -- while a card is found, costs nothing to let go, however close it is: now that a fee nobody
  -- paid is owed (PAY-06), recording one here would bill a learner for a lesson they never had.
  v_late := v_booking.status in ('confirmed', 'in_progress')
            and v_booking.starts_at - now() < make_interval(hours => v_window);

  -- Nothing is charged when the instructor or the Business is the one calling it off (R-08).
  if v_late and v_by = 'learner' then
    v_fee := round(v_booking.price_pence * greatest(least(v_percent, 100), 0) / 100.0);
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_user,
         cancel_reason = v_reason,
         late_cancellation = v_late,
         fee_pence = v_fee,
         version = version + 1
   where id = p_booking_id;

  -- A lesson paid with credit: every minute back, less the fee when the learner cancelled late,
  -- which the credit pays (R-07).
  if v_booking.payment_status = 'paid_credit' then
    v_credit := private.give_back_credit(
      p_booking_id,
      case when v_late and v_by = 'learner' then v_percent else 0 end,
      v_user
    );
    update public.bookings
       set payment_status = case
             when (v_credit ->> 'kept')::integer = 0 then 'refunded'
             when (v_credit ->> 'returned')::integer = 0 then 'paid_credit'
             else 'partially_refunded'
           end::public.booking_payment_status
     where id = p_booking_id;
  end if;

  -- Money paid for it: whatever the fee does not keep goes back (R-06, R-08, PAY-09).
  v_money := private.settle_cancelled_payments(
    p_booking_id,
    v_fee,
    v_user,
    case
      when v_by = 'learner' and v_fee > 0 then 'Cancelled late: the rest of the payment after the fee'
      when v_by = 'learner' then 'Cancelled in time'
      else left('Cancelled by the instructor: ' || v_reason, 500)
    end
  );

  perform private.write_audit('booking.cancelled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', 'cancelled', 'by', v_by, 'late', v_late, 'fee_pence', v_fee, 'reason', v_reason,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer)
      || v_money);
  perform private.enqueue_event('booking.cancelled',
    jsonb_build_object('booking_id', p_booking_id, 'by', v_by, 'late', v_late, 'fee_pence', v_fee,
                       'window_hours', v_window, 'fee_percent', v_percent,
                       -- Below zero for a lesson already under way.
                       'minutes_before', floor(extract(epoch from v_booking.starts_at - now()) / 60)::integer,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer)
      || v_money);

  return jsonb_build_object('late', v_late, 'fee_pence', v_fee, 'by', v_by,
                            'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                            'credit_kept_minutes', (v_credit ->> 'kept')::integer)
         || v_money;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- A late fee on a lesson nobody paid for is owed, and can be paid in person.
-- ---------------------------------------------------------------------------------------

/**
 * record_offline_payment from 20260914240000, which now also takes the fee for a lesson called
 * off late that nobody had paid for (PAY-05, PAY-09). The payment is the fee, not the lesson.
 * Charging that fee to a saved card is M3-19.
 */
create or replace function public.record_offline_payment(p_booking_id uuid, p_method text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_fee_owed boolean;
  v_amount integer;
  v_payment_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash', 'bank') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "method"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- A lesson that is on, or has happened, and is not paid for any other way; or one called off
  -- late whose fee is still owed. A request is not a lesson yet.
  v_fee_owed := v_booking.status = 'cancelled' and coalesce(v_booking.fee_pence, 0) > 0;
  if v_booking.status not in ('pending_payment', 'confirmed', 'in_progress', 'completed') and not v_fee_owed then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.payment_status not in ('unpaid', 'pending', 'failed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment"}';
  end if;
  v_amount := case when v_fee_owed then v_booking.fee_pence else v_booking.price_pence end;
  if v_amount <= 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "price"}';
  end if;

  insert into public.payments (business_id, learner_id, payer_id, booking_id, provider, amount_pence,
                               method, status, paid_at)
  values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, 'offline',
          v_amount, p_method::public.payment_method, 'paid', now())
  returning id into v_payment_id;

  -- Paid is paid: a slot held while a card was being found needs holding no longer.
  update public.bookings
     set status = case when status = 'pending_payment' then 'confirmed'::public.booking_status else status end,
         hold_expires_at = null,
         payment_status = case when p_method = 'cash' then 'paid_cash' else 'paid_bank' end::public.booking_payment_status,
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit('payment.recorded', 'payment', v_payment_id, v_booking.business_id, null,
    jsonb_build_object('booking_id', p_booking_id, 'method', p_method, 'amount_pence', v_amount, 'fee', v_fee_owed));
  perform private.enqueue_event('payment.received',
    jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));

  return v_payment_id;
end;
$$;

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

    -- Lessons that could be owed for, and lessons called off late whose fee nobody has paid.
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
           or (b.status = 'cancelled'
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

revoke all on function public.settle_offline_refund(uuid) from public, anon;
grant execute on function public.settle_offline_refund(uuid) to authenticated;
