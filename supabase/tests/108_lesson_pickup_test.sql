-- Where a lesson is collected from, set after it was booked (COV-04, D-185): the learner does it
-- themselves, their instructor may too, a stranger may not, and nobody may point a lesson at
-- somebody else's front door or at a lesson that has been and gone.
begin;
select plan(9);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'
\set other_learner 'c0000000-0000-0000-0000-000000000002'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set other_user 'b0000000-0000-0000-0000-000000000003'

-- A place of the learner's own, and one of somebody else's. The id is the table's to give: a
-- learner is not granted the column, which is the point of asking the RPC for the change.
select tests.authenticate_as(:'learner');
insert into public.pickup_points (learner_id, kind, label, address, postcode)
values (:'learner', 'home', 'Home', '12 Hyde Park Road, Leeds', 'LS6 1AB');
select id as mine from public.pickup_points where learner_id = :'learner' and label = 'Home' \gset
select tests.clear_authentication();

select tests.authenticate_as(:'other_learner');
insert into public.pickup_points (learner_id, kind, label, address, postcode)
values (:'other_learner', 'home', 'Their home', '3 Otley Road, Leeds', 'LS6 2AA');
select id as theirs from public.pickup_points where learner_id = :'other_learner' and label = 'Their home' \gset
select tests.clear_authentication();

-- A lesson of theirs with Asha, still to come.
\set lesson 'e0000000-0000-0000-0000-000000000009'
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes,
                             status, price_pence, source)
values (:'lesson', 'aaaa0000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', :'learner',
        'a2000000-0000-0000-0000-000000000001', now() + interval '2 days', now() + interval '2 days 2 hours', 30,
        'confirmed', 6200, 'instructor');

-- The learner says where they are collected.
select tests.authenticate_as(:'learner');
select lives_ok(
  format($$ select public.set_booking_pickup(%L, %L) $$, :'lesson', :'mine'),
  'a learner says where their lesson starts'
);
select is(
  (select pickup_point_id from public.bookings where id = :'lesson'),
  (:'mine')::uuid,
  'and the lesson is collected from there'
);

-- Not somebody else's place, however much they would like the lift.
select throws_ok(
  format($$ select public.set_booking_pickup(%L, %L) $$, :'lesson', :'theirs'),
  'VALIDATION_FAILED',
  'a place that is not theirs is refused'
);

-- Taking it off again is theirs to do.
select lives_ok(
  format($$ select public.set_booking_pickup(%L, null) $$, :'lesson'),
  'a learner takes the pickup point off the lesson'
);
select is(
  (select pickup_point_id from public.bookings where id = :'lesson'),
  null,
  'and the lesson has none'
);
select tests.clear_authentication();

-- Their instructor sets it too, and it is written down who did.
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ select public.set_booking_pickup(%L, %L) $$, :'lesson', :'mine'),
  'their instructor sets it as well'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log where action = 'booking.pickup_set' and entity_id = :'lesson'),
  3,
  'every change is written down'
);

-- Ian teaches the same learner at the other Business, but not this lesson.
select tests.authenticate_as(:'other_user');
select throws_ok(
  format($$ select public.set_booking_pickup(%L, %L) $$, :'lesson', :'mine'),
  'NOT_ALLOWED',
  'somebody else cannot touch the lesson'
);
select tests.clear_authentication();

-- A lesson that has been taught is not one to be collected for.
update public.bookings set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' where id = :'lesson';
select tests.authenticate_as(:'learner');
select throws_ok(
  format($$ select public.set_booking_pickup(%L, %L) $$, :'lesson', :'mine'),
  'VALIDATION_FAILED',
  'a lesson that is over cannot be changed'
);
select tests.clear_authentication();

select * from finish();
rollback;
