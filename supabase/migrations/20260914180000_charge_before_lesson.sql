-- Charging a card the day before a lesson (PAY-03, M3-09).
--
-- A lesson booked to be paid the day before is charged to the newest card its learner keeps
-- with that Business, about 24 hours before it starts, with nobody at the keyboard. The
-- database says which lessons are due and writes down a charge that could not be made; a job
-- does the talking to the provider, and the webhook records a charge that went through, as it
-- does every other payment.

/**
 * Lessons due to be charged now: booked to be paid the day before, on, unpaid, and starting
 * within the window. Each comes with the account it is paid into and the learner's customer on
 * it, which is missing for a learner who has never saved a card there: they are still due, and
 * the job says so to both of them.
 */
create or replace function public.system_lessons_to_charge(p_within_hours integer default 24)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'booking_id', b.id,
             'business_id', b.business_id,
             'account_id', bus.stripe_account_id,
             'customer_id', bc.provider_customer_id,
             'amount_pence', b.price_pence,
             'starts_at', b.starts_at
           ) order by b.starts_at),
           '[]'::jsonb)
    from public.bookings b
    join public.businesses bus on bus.id = b.business_id
    left join public.billing_customers bc on bc.business_id = b.business_id and bc.learner_id = b.learner_id
   where b.payment_mode = 'before_lesson'
     and b.status = 'confirmed'
     and b.payment_status = 'unpaid'
     and b.price_pence > 0
     and b.starts_at > now()
     and b.starts_at <= now() + make_interval(hours => least(greatest(coalesce(p_within_hours, 24), 1), 24 * 400))
     and bus.stripe_charges_enabled
     and bus.stripe_account_id is not null;
$$;

/**
 * A charge the day before that could not be made (PAY-03). The lesson stays on and is owed for,
 * the learner is asked to pay it themselves, and both of them are told, once.
 */
create or replace function public.system_record_charge_failed(p_booking_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  if p_reason is null or p_reason not in ('no_card', 'expired_card', 'declined', 'authentication_required') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  update public.bookings
     set payment_status = 'failed', version = version + 1
   where id = p_booking_id
     and payment_mode = 'before_lesson'
     and payment_status = 'unpaid'
  returning business_id into v_business;

  if v_business is null then
    return false;
  end if;

  perform private.write_audit('payment.charge_failed', 'booking', p_booking_id, v_business, null,
    jsonb_build_object('reason', p_reason));
  perform private.enqueue_event('payment.charge_failed',
    jsonb_build_object('booking_id', p_booking_id, 'reason', p_reason));

  return true;
end;
$$;

revoke all on function public.system_lessons_to_charge(integer) from public, anon, authenticated;
revoke all on function public.system_record_charge_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.system_lessons_to_charge(integer) to service_role;
grant execute on function public.system_record_charge_failed(uuid, text) to service_role;
