-- The two sweeps that only change the database run on its own scheduler, and a hold that lapsed
-- tells the job that calls it off at the provider which attempts are still open (D-274).
begin;
select plan(9);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- ---------------------------------------------------------------------------------------
-- The schedule.
-- ---------------------------------------------------------------------------------------
select is(
  (select array[schedule, command] from cron.job where jobname = 'expire-payment-holds'),
  array['*/5 * * * *', 'select public.system_expire_payment_holds()'],
  'a slot whose payment hold ran out is given back every five minutes, by the database'
);
select is(
  (select array[schedule, command] from cron.job where jobname = 'expire-booking-requests'),
  array['*/5 * * * *', 'select public.system_expire_requests()'],
  'and a request nobody answered lapses every five minutes too'
);
select is(
  (select count(*)::integer from cron.job where jobname in ('expire-payment-holds', 'expire-booking-requests')),
  2,
  'once each'
);

-- ---------------------------------------------------------------------------------------
-- A held lesson, an attempt at the provider, and the hold running out.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_sweeps');
select tests.clear_authentication();
select public.system_set_payments_state('acct_sweeps', true, true, true);

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', d, '06:00', '22:00' from generate_series(1, 7) as d;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

select (((private.today() + 3)::timestamp + time '10:00') at time zone 'Europe/London') as slot \gset

select tests.authenticate_as(:'lee');
select public.create_booking(:'ian', :'lee', :'lesson_type', :'slot'::timestamptz, 60) as lesson \gset
select public.set_payment_intent(:'lesson', 'pi_sweeps', 4200) as payment \gset
select tests.clear_authentication();

select is(
  public.system_hold_cancellations(:'lesson'),
  '[]'::jsonb,
  'a hold that has not run out has nothing to call off'
);

update public.bookings set hold_expires_at = now() - interval '1 minute' where id = :'lesson';
select public.system_expire_payment_holds();

select is(
  public.system_hold_cancellations(:'lesson'),
  jsonb_build_array(jsonb_build_object('payment_id', :'payment'::uuid, 'account_id', 'acct_sweeps', 'intent_id', 'pi_sweeps')),
  'once it has, the attempt still open at the provider is named, with the account it is under'
);
select is(
  (select count(*)::integer from public.outbox_events where name = 'booking.hold_expired' and payload ->> 'booking_id' = :'lesson'),
  1,
  'and the job that calls it off is told, once'
);

select public.system_record_payment_cancelled(:'payment');
select is(
  public.system_hold_cancellations(:'lesson'),
  '[]'::jsonb,
  'an attempt already called off is not named again'
);

-- ---------------------------------------------------------------------------------------
-- Nobody but the job runner may ask.
-- ---------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.system_hold_cancellations(uuid)', 'execute'),
  'nobody signed in may ask which holds are open'
);
select ok(
  has_function_privilege('service_role', 'public.system_hold_cancellations(uuid)', 'execute'),
  'the job runner may'
);

select * from finish();
