-- A school sees when its linked instructors are free and busy, and nothing more of their diary, their
-- learners or their money (M9-08, D-284).
begin;
select plan(10);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'

-- Asha's own Business is linked to the school, and she teaches Lee at ten tomorrow, with the
-- afternoon off.
insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'asha_biz', :'asha', :'lee', 'a2000000-0000-0000-0000-000000000001',
        (private.today() + 1 + time '10:00') at time zone 'Europe/London',
        (private.today() + 1 + time '11:00') at time zone 'Europe/London', 30, 'confirmed', 4500, 'instructor');
insert into public.availability_exceptions (business_id, instructor_id, kind, starts_at, ends_at, reason)
values (:'asha_biz', :'asha', 'blocked',
        (private.today() + 1 + time '13:00') at time zone 'Europe/London',
        (private.today() + 1 + time '17:00') at time zone 'Europe/London', 'Dentist');
-- A lesson that was called off takes no time.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source, cancelled_at)
values (:'asha_biz', :'asha', :'lee', 'a2000000-0000-0000-0000-000000000001',
        (private.today() + 1 + time '08:00') at time zone 'Europe/London',
        (private.today() + 1 + time '09:00') at time zone 'Europe/London', 30, 'cancelled', 4500, 'instructor', now());

select tests.authenticate_as(:'ben');
select is(
  jsonb_array_length(public.school_linked_busy(:'school', (private.today() + 1)::timestamp at time zone 'Europe/London',
                                              (private.today() + 2)::timestamp at time zone 'Europe/London')),
  1,
  'the owner sees the one instructor linked to the school'
);
select is(
  (public.school_linked_busy(:'school', (private.today() + 1)::timestamp at time zone 'Europe/London',
                             (private.today() + 2)::timestamp at time zone 'Europe/London') -> 0 ->> 'businessName'),
  'Asha Driving',
  'by the business she runs'
);
select is(
  (select array_agg(x ->> 'kind' order by x ->> 'startsAt')
     from jsonb_array_elements(public.school_linked_busy(:'school', (private.today() + 1)::timestamp at time zone 'Europe/London',
                                                         (private.today() + 2)::timestamp at time zone 'Europe/London') -> 0 -> 'busy') as x),
  array['lesson', 'away'],
  'busy with a lesson in the morning and away in the afternoon, and not with the lesson called off'
);
select is(
  (select array_agg(distinct k order by k)
     from jsonb_array_elements(public.school_linked_busy(:'school', (private.today() + 1)::timestamp at time zone 'Europe/London',
                                                         (private.today() + 2)::timestamp at time zone 'Europe/London') -> 0 -> 'busy') as x,
          jsonb_object_keys(x) as k),
  array['endsAt', 'kind', 'startsAt'],
  'each says when, and nothing about who the lesson is with, what it is or what it costs'
);

-- Row level security keeps the rest from the school: it is not a member of her Business.
select is((select count(*)::int from public.bookings where business_id = :'asha_biz'), 0, 'the owner reads none of her bookings');
select is((select count(*)::int from public.payments where business_id = :'asha_biz'), 0, 'nor her payments');
select is((select count(*)::int from public.learner_relationships where business_id = :'asha_biz'), 0, 'nor who her learners are');

select tests.authenticate_as(:'manager');
select is(
  jsonb_array_length(public.school_linked_busy(:'school', (private.today() + 1)::timestamp at time zone 'Europe/London',
                                              (private.today() + 2)::timestamp at time zone 'Europe/London')),
  1,
  'a manager sees it too'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.school_linked_busy(%L, now(), now() + interval '1 day') $$, :'school'),
  'NOT_ALLOWED',
  'an instructor at the school does not'
);
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.school_linked_busy(%L, now(), now() + interval '60 days') $$, :'school'),
  'VALIDATION_FAILED',
  'and nobody reads months of somebody else''s diary at once'
);

select * from finish();
rollback;
