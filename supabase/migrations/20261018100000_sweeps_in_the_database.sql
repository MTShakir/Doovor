-- Two sweeps that only change the database run inside it, on its own scheduler (D-274).
--
-- Giving back a slot whose payment hold ran out (R-10), and lapsing a request nobody answered
-- (R-12), are each one function call with nothing outside the database to talk to. On the job
-- runner they cost a run every few minutes from a free plan with a monthly limit; here they cost
-- nothing, so they go back to every five minutes.
--
-- What a lapsed hold leaves at the payment provider is the job runner's still, because only the
-- app can talk to the provider. The hold sweep already raises `booking.hold_expired` for each
-- booking it gives back, and a job answers that one booking at a time, from
-- `system_hold_cancellations` below.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------------------
-- system_hold_cancellations: the attempts at the provider an expired booking still has open,
-- for the job that calls them off. Only for a booking that has expired, and only while pending.
-- ---------------------------------------------------------------------------------------
create function public.system_hold_cancellations(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'payment_id', p.id,
             'account_id', bus.stripe_account_id,
             'intent_id', p.provider_ref
           )),
           '[]'::jsonb)
    from public.payments p
    join public.bookings b on b.id = p.booking_id
    join public.businesses bus on bus.id = p.business_id
   where p.booking_id = p_booking_id
     and b.status = 'expired'
     and p.status = 'pending'
     and p.provider_ref is not null
     and bus.stripe_account_id is not null;
$$;

revoke all on function public.system_hold_cancellations(uuid) from public, anon, authenticated;
grant execute on function public.system_hold_cancellations(uuid) to service_role;

-- ---------------------------------------------------------------------------------------
-- The schedule. A job with the same name is replaced, so running this again changes nothing.
-- ---------------------------------------------------------------------------------------
select cron.schedule('expire-payment-holds', '*/5 * * * *', $$select public.system_expire_payment_holds()$$);
select cron.schedule('expire-booking-requests', '*/5 * * * *', $$select public.system_expire_requests()$$);
