-- A learner is told when their request runs out with nobody answering it (BOK-06, R-12, NTF-03, D-377).
begin;
select plan(4);

select tests.create_fixture();

\set asha 'aaaa0000-0000-0000-0000-000000000000'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set standard 'a2000000-0000-0000-0000-000000000001'

-- A request nobody has answered, past its time, and a time held for payment, past its time.
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source, expires_at)
values ('f0000000-0000-0000-0000-000000000176', :'asha', :'asha_profile', :'lee', :'standard',
        now() + interval '3 days', now() + interval '3 days 1 hour', 0, 'requested', 4200, 'self', now() - interval '1 minute');
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source, hold_expires_at)
values ('f0000000-0000-0000-0000-000000000177', :'asha', :'asha_profile', :'lee', :'standard',
        now() + interval '4 days', now() + interval '4 days 1 hour', 0, 'pending_payment', 4200, 'self', now() - interval '1 minute');

delete from public.outbox_events;

select is(public.system_expire_requests(), 1, 'the sweep lapses the request');
select results_eq(
  $$ select name, payload ->> 'booking_id', payload ->> 'lapsed' from public.outbox_events $$,
  $$ values ('booking.declined', 'f0000000-0000-0000-0000-000000000176', 'true') $$,
  'and raises the event a turned-down request raises, marked as having run out'
);

-- A time held for payment that lapses is not a request nobody answered.
delete from public.outbox_events;
select ok((public.system_expire_payment_holds() ->> 'expired')::int >= 1, 'the hold sweep gives the held time back');
select is_empty(
  $$ select 1 from public.outbox_events where name = 'booking.declined' $$,
  'and tells nobody it was turned down'
);

select * from finish();
rollback;
