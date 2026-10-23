-- A change to a lesson names who made it, so they are not emailed about it (NTF-03, NTF-04, D-384).
begin;
select plan(5);

select tests.create_fixture();

\set asha 'aaaa0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set standard 'a2000000-0000-0000-0000-000000000001'

insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'asha_profile', :'asha', day, '06:00', '22:00' from generate_series(1, 7) as day;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'asha', :'standard', 60, 4200);

delete from public.outbox_events;

-- The instructor books a lesson herself.
select tests.authenticate_as(:'asha_user');
select public.create_booking(
  :'asha_profile', :'lee', :'standard',
  (((now() at time zone 'Europe/London')::date + 6) + time '10:00') at time zone 'Europe/London', 60
) as lesson \gset
select tests.clear_authentication();

select is(
  (select payload ->> 'actor' from public.outbox_events where name = 'booking.created' and payload ->> 'booking_id' = :'lesson'),
  :'asha_user',
  'the lesson she booked names her as the one who booked it'
);
select is(
  (select payload ->> 'booking_id' from public.outbox_events where name = 'booking.created' and payload ->> 'booking_id' = :'lesson'),
  :'lesson',
  'and still says which lesson it is'
);

-- A job, a webhook or a sweep is nobody.
select private.enqueue_event('booking.cancelled', jsonb_build_object('booking_id', :'lesson'));
select ok(
  (select not (payload ? 'actor') from public.outbox_events where name = 'booking.cancelled' and payload ->> 'booking_id' = :'lesson'),
  'what nobody asked for names nobody'
);

-- Only lessons' events carry it, and what a caller wrote is never replaced.
select tests.authenticate_as(:'lee');
select private.enqueue_event('learner.joined', jsonb_build_object('invitation_id', :'lesson'));
select private.enqueue_event('booking.rescheduled', jsonb_build_object('booking_id', :'lesson', 'actor', :'asha_user'));
select tests.clear_authentication();
select is(
  (select payload from public.outbox_events where name = 'learner.joined'),
  jsonb_build_object('invitation_id', :'lesson'),
  'an event that is not about a lesson is left as it was written'
);
select is(
  (select payload ->> 'actor' from public.outbox_events where name = 'booking.rescheduled'),
  :'asha_user',
  'and an actor already given stands'
);

select * from finish();
rollback;
