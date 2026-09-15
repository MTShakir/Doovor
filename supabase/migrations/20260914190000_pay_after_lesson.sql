-- Paying for a lesson after it has happened (PAY-03, M3-10).
--
-- A lesson booked to be paid after it happens asks the learner to pay the moment the
-- instructor marks it done: the notice that goes out needs to know how the lesson is paid
-- for and whether it already is. And a lesson that has finished can still be paid for, which
-- the function that holds a slot while somebody pays did not allow.
--
-- system_booking_notice is the function from 20260913270000 with the payment added, and
-- hold_booking_for_payment the one from 20260914140000 with a finished lesson let through.

create or replace function public.system_booking_notice(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'booking_id', b.id,
    'business_id', b.business_id,
    'status', b.status::text,
    'version', b.version,
    'starts_at', b.starts_at,
    'ends_at', b.ends_at,
    'price_pence', b.price_pence,
    'fee_pence', b.fee_pence,
    'payment_mode', b.payment_mode::text,
    'payment_status', b.payment_status::text,
    'late_cancellation', coalesce(b.late_cancellation, false),
    'cancel_reason', b.cancel_reason,
    'learner_user_id', b.learner_id,
    'learner_name', l.full_name,
    'instructor_user_id', i.user_id,
    'instructor_name', i.display_name,
    'school_user_ids', coalesce(
      (select jsonb_agg(m.user_id)
         from public.memberships m
         join public.businesses bu on bu.id = m.business_id
        where m.business_id = b.business_id
          and m.status = 'active'
          and m.role in ('owner', 'manager')
          and bu.type = 'school'
          and m.user_id <> i.user_id),
      '[]'::jsonb
    )
  )
    from public.bookings b
    join public.instructor_profiles i on i.id = b.instructor_id
    join public.users l on l.id = b.learner_id
   where b.id = p_booking_id;
$$;

/**
 * Gets a learner's own lesson ready to be paid for (R-10). A lesson paid for at booking is held
 * while they pay; one that is on, or has happened, and is paid for any other way is left as it
 * is, because there is no slot left to lose.
 */
create or replace function public.hold_booking_for_payment(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_mode text;
  v_hold timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_booking.learner_id <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_booking.status not in ('confirmed', 'pending_payment', 'in_progress', 'completed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.payment_status in ('paid_card', 'paid_cash', 'paid_bank', 'paid_credit') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment_status"}';
  end if;

  v_mode := private.payment_mode(v_booking.business_id);
  -- Only a lesson still to come, at a Business that takes its money at booking, has a slot to
  -- hold. Anything else is paid for as it stands.
  if v_mode <> 'at_booking'
     or v_booking.status in ('in_progress', 'completed')
     or v_booking.payment_mode in ('before_lesson', 'after_lesson') then
    return jsonb_build_object('held', false, 'mode', v_mode, 'amount_pence', v_booking.price_pence);
  end if;

  update public.bookings
     set status = 'pending_payment',
         payment_mode = 'at_booking',
         payment_status = 'pending',
         hold_expires_at = coalesce(hold_expires_at, now() + interval '15 minutes'),
         version = version + 1
   where id = p_booking_id
  returning hold_expires_at into v_hold;

  return jsonb_build_object(
    'held', true,
    'mode', v_mode,
    'amount_pence', v_booking.price_pence,
    'hold_expires_at', v_hold
  );
end;
$$;

revoke all on function public.system_booking_notice(uuid) from public, anon, authenticated;
revoke all on function public.hold_booking_for_payment(uuid) from public, anon;
grant execute on function public.system_booking_notice(uuid) to service_role;
grant execute on function public.hold_booking_for_payment(uuid) to authenticated;
