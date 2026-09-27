-- A new lesson starts where that learner's lessons start (COV-04, D-215): the pickup point marked
-- "Lessons start here" is filled in when a booking names none, whoever made the booking, and a
-- booking that names one keeps it.
begin;
select plan(6);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'
\set other_learner 'c0000000-0000-0000-0000-000000000002'
\set business 'aaaa0000-0000-0000-0000-000000000000'
\set instructor 'a1000000-0000-0000-0000-000000000001'
\set lesson_type 'a2000000-0000-0000-0000-000000000001'

-- Two places of the learner's own. The first is their default; the second is not.
select tests.authenticate_as(:'learner');
insert into public.pickup_points (learner_id, kind, label, address, postcode)
values (:'learner', 'home', 'Home', '12 Hyde Park Road, Leeds', 'LS6 1AB'),
       (:'learner', 'work', 'Work', '1 Wellington Place, Leeds', 'LS1 4AP');
select id as usual from public.pickup_points where learner_id = :'learner' and label = 'Home' \gset
select id as work from public.pickup_points where learner_id = :'learner' and label = 'Work' \gset
select tests.clear_authentication();

select is(
  (select is_default from public.pickup_points where id = :'usual'),
  true,
  'the first place a learner saves is where their lessons start'
);

-- A booking that names nowhere.
\set quiet 'e0000000-0000-0000-0000-00000000f001'
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'quiet', :'business', :'instructor', :'learner', :'lesson_type',
        now() + interval '3 days', now() + interval '3 days 1 hour', 30, 'confirmed', 4200, 'instructor');

select is(
  (select pickup_point_id from public.bookings where id = :'quiet'),
  (:'usual')::uuid,
  'a booking that names no pickup point starts where their lessons start'
);

-- A booking that names one keeps the one it names.
\set chosen 'e0000000-0000-0000-0000-00000000f002'
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, pickup_point_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'chosen', :'business', :'instructor', :'learner', :'lesson_type', :'work',
        now() + interval '5 days', now() + interval '5 days 1 hour', 30, 'confirmed', 4200, 'instructor');

select is(
  (select pickup_point_id from public.bookings where id = :'chosen'),
  (:'work')::uuid,
  'and a booking that names one is left alone'
);

-- Taking it off afterwards leaves it off: the rule fills a new lesson in, it does not put one back.
select tests.authenticate_as(:'learner');
select public.set_booking_pickup(:'quiet', null);
select tests.clear_authentication();
select is(
  (select pickup_point_id from public.bookings where id = :'quiet'),
  null,
  'taking the pickup point off a lesson leaves it off'
);

-- A learner with nowhere saved books as before, with nowhere on the lesson.
\set nowhere 'e0000000-0000-0000-0000-00000000f003'
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'nowhere', :'business', :'instructor', :'other_learner', :'lesson_type',
        now() + interval '7 days', now() + interval '7 days 1 hour', 30, 'confirmed', 4200, 'instructor');

select is(
  (select pickup_point_id from public.bookings where id = :'nowhere'),
  null,
  'a learner with nowhere saved gets a lesson with nowhere on it'
);

-- And the rule reaches only the learner the lesson is for: the other learner's own default is not
-- what this lesson gets.
select tests.authenticate_as(:'other_learner');
insert into public.pickup_points (learner_id, kind, label, address, postcode)
values (:'other_learner', 'home', 'Their home', '3 Otley Road, Leeds', 'LS6 2AA');
select id as theirs from public.pickup_points where learner_id = :'other_learner' and label = 'Their home' \gset
select tests.clear_authentication();

\set mine 'e0000000-0000-0000-0000-00000000f004'
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'mine', :'business', :'instructor', :'learner', :'lesson_type',
        now() + interval '9 days', now() + interval '9 days 1 hour', 30, 'confirmed', 4200, 'instructor');

select isnt(
  (select pickup_point_id from public.bookings where id = :'mine'),
  (:'theirs')::uuid,
  'and never somebody else s front door'
);

select * from finish();
rollback;
