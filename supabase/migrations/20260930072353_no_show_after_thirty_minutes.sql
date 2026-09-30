-- Nobody came: half an hour, not a quarter (R-09, D-228).
--
-- R-09 allowed a no-show fifteen minutes after the start and the product owner has moved it to
-- thirty. An instructor who waits gives the learner a proper half hour before the lesson counts
-- against them, and half an hour is long enough that nobody records one on a whim.
--
-- The screen agrees: `noShowAfterMinutes` in packages/core says the same number, and the button
-- appears at that moment now rather than waiting for the lesson's booked time to be up. Marking a
-- lesson done still waits for the end (D-213), because a lesson is asked about once it is over.
-- Only this one check changes; the rest of the function is exactly as it was.

create or replace function public.mark_no_show(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_rules jsonb;
  v_percent integer;
  v_fee integer;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_dispute_until timestamptz := now() + interval '7 days';
  v_credit jsonb := jsonb_build_object('returned', 0, 'kept', 0);
  v_money jsonb;
  v_charging boolean;
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
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_booking.status not in ('confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if now() < v_booking.starts_at + interval '30 minutes' then
    raise exception 'TOO_CLOSE' using errcode = 'P0001';
  end if;

  v_rules := private.booking_rules(v_booking.instructor_id);
  v_percent := least(greatest(coalesce((v_rules ->> 'late_fee_percent')::int, 100), 0), 100);
  v_fee := round(v_booking.price_pence * v_percent / 100.0);

  update public.bookings
     set status = 'no_show',
         late_cancellation = true,
         fee_pence = v_fee,
         cancel_reason = v_reason,
         dispute_until = v_dispute_until,
         version = version + 1
   where id = p_booking_id;

  -- Credit pays the fee first, and what the fee does not keep comes back (R-07).
  -- Whatever credit the lesson holds comes back, less the fee the credit pays (R-09). A lesson
  -- part paid by credit holds minutes too, and its money status is settled below (D-225).
  if v_booking.credit_minutes > 0 then
    v_credit := private.give_back_credit(p_booking_id, v_percent, v_user);
    -- What the fee keeps in minutes pays its share of the fee, and the rest of it is money
    -- (D-225), the same sum `cancellationOutcome` works out for the screen.
    v_fee := greatest(v_fee - private.credit_value_pence(
                        v_booking.price_pence,
                        (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::integer,
                        (v_credit ->> 'kept')::integer), 0);
    update public.bookings set fee_pence = v_fee where id = p_booking_id;
    if v_booking.payment_status = 'paid_credit' then
      update public.bookings
         set payment_status = case
               when (v_credit ->> 'kept')::integer = 0 then 'refunded'
               when (v_credit ->> 'returned')::integer = 0 then 'paid_credit'
               else 'partially_refunded'
             end::public.booking_payment_status
       where id = p_booking_id;
    end if;
  end if;

  -- Then money already paid, and whatever the fee does not keep goes back (PAY-09).
  v_money := private.settle_cancelled_payments(p_booking_id, v_fee, v_user, 'No-show: the rest of the payment after the fee');

  -- A fee nothing has paid goes to the card the learner keeps with the Business (PAY-09).
  v_charging := private.ask_for_fee(p_booking_id);

  perform private.write_audit('booking.no_show', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', 'no_show', 'fee_pence', v_fee, 'reason', v_reason, 'dispute_until', v_dispute_until,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                       'charging', v_charging)
      || v_money);
  perform private.enqueue_event('booking.no_show',
    jsonb_build_object('booking_id', p_booking_id, 'fee_pence', v_fee, 'fee_percent', v_percent,
                       'dispute_until', v_dispute_until,
                       'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                       'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                       'charging', v_charging)
      || v_money);

  return jsonb_build_object('fee_pence', v_fee, 'dispute_until', v_dispute_until,
                            'credit_returned_minutes', (v_credit ->> 'returned')::integer,
                            'credit_kept_minutes', (v_credit ->> 'kept')::integer,
                            'charging', v_charging)
         || v_money;
end;
$$;