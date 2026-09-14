-- Cash and bank transfers, recorded in two taps (PAY-05, R-10, M3-15).
--
-- Plenty of learners pay their instructor in cash or by bank transfer, and the diary should say
-- so. The instructor teaching the lesson, or somebody who manages the Business's bookings,
-- records it: a payment row with the method, and the lesson marked paid, which shows as
-- "Paid (cash)" or "Paid (bank)". No money moves through the platform, so nothing waits for a
-- webhook. A card payment already on its way for the same lesson that lands afterwards is given
-- back, as every second payment for a paid lesson is (20260914150000).
--
-- A slip, cash tapped for a bank transfer or the wrong lesson, is put right straight away with
-- undo. For ten minutes an offline payment that nothing else has touched can be taken back out;
-- after that it is a record like any other, and correcting it is a refund (PAY-07).

/**
 * Records that a lesson was paid in person (PAY-05). Returns the payment.
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

  -- A lesson that is on, or has happened, and is not paid for any other way. A request is not a
  -- lesson yet, and money for one that was called off is a fee, which is M3-18.
  if v_booking.status not in ('pending_payment', 'confirmed', 'in_progress', 'completed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.payment_status not in ('unpaid', 'pending', 'failed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment"}';
  end if;
  if v_booking.price_pence <= 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "price"}';
  end if;

  insert into public.payments (business_id, learner_id, payer_id, booking_id, provider, amount_pence,
                               method, status, paid_at)
  values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, 'offline',
          v_booking.price_pence, p_method::public.payment_method, 'paid', now())
  returning id into v_payment_id;

  -- Paid is paid: a slot held while a card was being found needs holding no longer.
  update public.bookings
     set status = case when status = 'pending_payment' then 'confirmed'::public.booking_status else status end,
         hold_expires_at = null,
         payment_status = case when p_method = 'cash' then 'paid_cash' else 'paid_bank' end::public.booking_payment_status,
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit('payment.recorded', 'payment', v_payment_id, v_booking.business_id, null,
    jsonb_build_object('booking_id', p_booking_id, 'method', p_method, 'amount_pence', v_booking.price_pence));
  perform private.enqueue_event('payment.received',
    jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));

  return v_payment_id;
end;
$$;

/**
 * Takes back an offline payment recorded by mistake, straight after it was recorded (PAY-05).
 * Only an offline payment for a lesson, within ten minutes, and only while nothing has been
 * refunded against it. The lesson is unpaid again. Returns the lesson.
 */
create or replace function public.undo_offline_payment(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking_id uuid;
  v_booking public.bookings;
  v_payment public.payments;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select booking_id into v_booking_id
    from public.payments
   where id = p_payment_id and provider = 'offline';
  if v_booking_id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- The lesson first, then its payment: the order recording one takes them in.
  select * into v_booking from public.bookings where id = v_booking_id for update;
  select * into v_payment from public.payments where id = p_payment_id for update;

  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_payment.created_at < now() - interval '10 minutes'
     or v_payment.status <> 'paid'
     or v_payment.refunded_pence > 0
     or exists (select 1 from public.refunds where payment_id = p_payment_id) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment"}';
  end if;

  delete from public.payments where id = p_payment_id;

  update public.bookings
     set payment_status = 'unpaid', version = version + 1
   where id = v_booking.id
     and payment_status in ('paid_cash', 'paid_bank');

  perform private.write_audit('payment.undone', 'payment', p_payment_id, v_booking.business_id,
    jsonb_build_object('booking_id', v_booking.id, 'method', v_payment.method, 'amount_pence', v_payment.amount_pence),
    null);

  return v_booking.id;
end;
$$;

revoke all on function public.record_offline_payment(uuid, text) from public, anon;
revoke all on function public.undo_offline_payment(uuid) from public, anon;
grant execute on function public.record_offline_payment(uuid, text) to authenticated;
grant execute on function public.undo_offline_payment(uuid) to authenticated;
