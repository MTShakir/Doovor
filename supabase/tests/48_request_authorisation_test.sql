-- A request to book holds the money rather than taking it (R-12, PAY-03, M3-08).
begin;
select plan(21);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_request');
select tests.clear_authentication();
select public.system_set_payments_state('acct_request', true, true, true);

-- Four requests nobody has answered yet, on days of their own.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source, expires_at)
values (:'school', :'ian', :'lee', :'lesson_type', now() + interval '3 days', now() + interval '3 days 1 hour',
        30, 'requested', 4200, 'self', now() + interval '12 hours')
returning id as accepted \gset

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source, expires_at)
values (:'school', :'ian', :'lou', :'lesson_type', now() + interval '4 days', now() + interval '4 days 1 hour',
        30, 'requested', 4200, 'self', now() + interval '12 hours')
returning id as declined \gset

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source, expires_at)
values (:'school', :'ian', :'liz', :'lesson_type', now() + interval '5 days', now() + interval '5 days 1 hour',
        30, 'requested', 4200, 'self', now() + interval '12 hours')
returning id as lapsed \gset

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source, expires_at)
values (:'school', :'ian', :'lee', :'lesson_type', now() + interval '6 days', now() + interval '6 days 1 hour',
        30, 'requested', 4200, 'self', now() + interval '12 hours')
returning id as uncapturable \gset

create or replace function pg_temp.is_due(p_booking uuid) returns text language sql as $$
  select coalesce(
    (select 'capture' from jsonb_array_elements(public.system_authorisations_due() -> 'capture') as one
      where (one ->> 'booking_id')::uuid = p_booking),
    (select 'release' from jsonb_array_elements(public.system_authorisations_due() -> 'release') as one
      where (one ->> 'booking_id')::uuid = p_booking),
    'nothing'
  );
$$;

-- ---------------------------------------------------------------------------------------
-- The card is authorised while the request waits.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event('evt_auth_accepted', 'payment_intent.amount_capturable_updated',
     'acct_request', jsonb_build_object('id', 'pi_accepted', 'amount_capturable', 4200,
       'metadata', jsonb_build_object('booking_id', :'accepted'))) ->> 'outcome'),
  'payment_authorised',
  'an authorised card for a request is written down'
);

select is(
  (select status::text || ' ' || amount_pence::text from public.payments where provider_ref = 'pi_accepted'),
  'authorised 4200',
  'as money set aside, not money taken'
);

select is(
  (select status::text || ' ' || payment_status::text from public.bookings where id = :'accepted'),
  'requested pending',
  'and the request still waits for an answer, with its payment on the way'
);

select is(
  (select public.system_process_stripe_event('evt_auth_accepted_again', 'payment_intent.amount_capturable_updated',
     'acct_request', jsonb_build_object('id', 'pi_accepted', 'amount_capturable', 4200,
       'metadata', jsonb_build_object('booking_id', :'accepted'))) ->> 'outcome'),
  'authorisation_already_recorded',
  'the same authorisation under a new event id is written down once'
);

select is(
  pg_temp.is_due(:'accepted'),
  'nothing',
  'a request nobody has answered is neither captured nor released'
);

-- ---------------------------------------------------------------------------------------
-- The instructor accepts: the money is taken.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select public.decide_booking_request(:'accepted', true);
select tests.clear_authentication();

select is(pg_temp.is_due(:'accepted'), 'capture', 'an accepted request is due to be captured');

select is(
  (select count(*)::int
     from jsonb_array_elements(public.system_authorisations_due() -> 'capture') as one
    where one ->> 'intent_id' = 'pi_accepted' and one ->> 'account_id' = 'acct_request'
      and (one ->> 'amount_pence')::int = 4200),
  1,
  'with the payment, the account and the amount the job needs'
);

select is(
  (select public.system_process_stripe_event('evt_captured', 'payment_intent.succeeded', 'acct_request',
     jsonb_build_object('id', 'pi_accepted', 'amount_received', 4200,
       'metadata', jsonb_build_object('booking_id', :'accepted'))) ->> 'outcome'),
  'payment_recorded',
  'the capture is recorded as the payment'
);

select is(
  (select b.status::text || ' ' || b.payment_status::text || ' ' || p.status::text
     from public.bookings b join public.payments p on p.booking_id = b.id
    where b.id = :'accepted'),
  'confirmed paid_card paid',
  'and the lesson is on and paid for'
);

select is(pg_temp.is_due(:'accepted'), 'nothing', 'so nothing is due for it any more');

-- ---------------------------------------------------------------------------------------
-- The instructor declines: the money is released.
-- ---------------------------------------------------------------------------------------
select public.system_process_stripe_event('evt_auth_declined', 'payment_intent.amount_capturable_updated',
  'acct_request', jsonb_build_object('id', 'pi_declined', 'amount_capturable', 4200,
    'metadata', jsonb_build_object('booking_id', :'declined')));

select tests.authenticate_as(:'ian_user');
select public.decide_booking_request(:'declined', false, 'Car is in for its MOT');
select tests.clear_authentication();

select is(pg_temp.is_due(:'declined'), 'release', 'a declined request is due to be released');

select is(
  (select public.system_record_payment_cancelled(id) from public.payments where provider_ref = 'pi_declined'),
  true,
  'releasing it is written down'
);

select is(
  (select p.status::text || ' ' || b.payment_status::text
     from public.payments p join public.bookings b on b.id = p.booking_id
    where p.provider_ref = 'pi_declined'),
  'cancelled unpaid',
  'and the learner was never charged for a lesson that is not happening'
);

select is(
  (select public.system_process_stripe_event('evt_released', 'payment_intent.canceled', 'acct_request',
     jsonb_build_object('id', 'pi_declined', 'metadata', jsonb_build_object('booking_id', :'declined'))) ->> 'outcome'),
  'cancellation_already_recorded',
  'the provider saying so afterwards changes nothing'
);

select is(pg_temp.is_due(:'declined'), 'nothing', 'and nothing is due for it any more');

-- ---------------------------------------------------------------------------------------
-- The request runs out, and the authorisation arrives after that.
-- ---------------------------------------------------------------------------------------
update public.bookings set expires_at = now() - interval '1 minute' where id = :'lapsed';
select public.system_expire_requests();

select is(
  (select public.system_process_stripe_event('evt_auth_lapsed', 'payment_intent.amount_capturable_updated',
     'acct_request', jsonb_build_object('id', 'pi_lapsed', 'amount_capturable', 4200,
       'metadata', jsonb_build_object('booking_id', :'lapsed'))) ->> 'outcome'),
  'payment_authorised',
  'an authorisation for a request that has already run out is still written down'
);

select is(pg_temp.is_due(:'lapsed'), 'release', 'so that it is released, not captured');

select is(
  (select public.system_process_stripe_event('evt_released_lapsed', 'payment_intent.canceled', 'acct_request',
     jsonb_build_object('id', 'pi_lapsed', 'metadata', jsonb_build_object('booking_id', :'lapsed'))) ->> 'outcome'),
  'payment_cancelled',
  'and the provider releasing it on its own is recorded as a release'
);

-- ---------------------------------------------------------------------------------------
-- An authorisation that cannot be captured.
-- ---------------------------------------------------------------------------------------
select public.system_process_stripe_event('evt_auth_uncapturable', 'payment_intent.amount_capturable_updated',
  'acct_request', jsonb_build_object('id', 'pi_uncapturable', 'amount_capturable', 4200,
    'metadata', jsonb_build_object('booking_id', :'uncapturable')));

select tests.authenticate_as(:'ian_user');
select public.decide_booking_request(:'uncapturable', true);
select tests.clear_authentication();

select is(
  (select public.system_record_capture_failed(id) from public.payments where provider_ref = 'pi_uncapturable'),
  true,
  'an authorisation the bank let go of before it was captured is written down'
);

select is(
  (select b.status::text || ' ' || b.payment_status::text || ' ' || p.status::text
     from public.bookings b join public.payments p on p.booking_id = b.id
    where b.id = :'uncapturable'),
  'confirmed unpaid failed',
  'and the lesson stays on, owed for, so the learner is asked to pay'
);

select is(
  (select public.system_record_capture_failed(id) from public.payments where provider_ref = 'pi_uncapturable'),
  false,
  'and it is written down once'
);

select * from finish();
rollback;
