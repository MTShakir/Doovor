-- A full list on Free takes nobody new, says so before anybody signs up, and keeps everybody it
-- has: they book as ever, and a learner moving with their instructor comes as an enquiry
-- (BOK-02, LRN-07, D-208, D-357, D-359, D-360).
begin;
select plan(9);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'
\set newcomer 'e1680000-0000-0000-0000-000000000001'
\set mover 'e1680000-0000-0000-0000-000000000002'

-- Ivy teaches at the school, which is on Free, books with no notice and is paid in person.
update public.businesses set plan = 'free',
       settings = coalesce(settings, '{}'::jsonb) || '{"notice_hours": 0, "payment_mode": "offline"}'
 where id = :'school';
update public.instructor_profiles
   set verification_status = 'approved', verified_at = now(), badge_expiry = private.today() + 200,
       qualification = 'adi', public_slug = 'ivy-full-list'
 where id = :'ivy';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ivy', :'school', weekday, '06:00', '22:00' from generate_series(1, 7) as weekday;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);
insert into public.learner_relationships (business_id, learner_id, instructor_id)
values (:'school', :'lou', :'ivy') on conflict do nothing;
select tests.create_user_with_id(:'newcomer', 'newcomer.168@test.local', 'New Comer');
select tests.create_user_with_id(:'mover', 'mover.168@test.local', 'Mo Ver');
insert into public.learner_profiles (user_id, transmission) values (:'newcomer', 'manual'), (:'mover', 'manual');
insert into public.learner_relationships (business_id, learner_id, status)
values (:'asha_biz', :'mover', 'active');

-- The list is full: the limit is however many it has now.
update public.platform_settings
   set value = jsonb_build_object('active_learners', private.learners_on_books(:'school'))
 where key = 'free_plan_limits';

create or replace function pg_temp.at(p_days integer, p_time text)
returns timestamptz language sql stable as $$
  select ((private.today() + p_days)::text || ' ' || p_time)::timestamp at time zone 'Europe/London';
$$;

-- ---------------------------------------------------------------------------------------
-- Said before anybody signs up (D-357).
-- ---------------------------------------------------------------------------------------
select is(
  (public.booking_page('ivy-full-list') ->> 'takingNewLearners')::boolean,
  false,
  'the booking link says a full list takes nobody new, to somebody not signed in'
);
select is(
  (public.instructor_profile_page('ivy-full-list') ->> 'takingNewLearners')::boolean,
  false,
  'and so does the profile'
);

select tests.authenticate_as(:'lou');
select is(
  (public.booking_page('ivy-full-list') ->> 'takingNewLearners')::boolean,
  true,
  'to somebody already on the books, the link books as ever'
);

-- ---------------------------------------------------------------------------------------
-- Everybody it has books as ever (D-359).
-- ---------------------------------------------------------------------------------------
select lives_ok(
  format($$ select public.create_booking(%L, %L, %L, %L, 60) $$, :'ivy', :'lou', :'lesson_type', pg_temp.at(3, '10:00')),
  'somebody already on the books books on a full list'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- Somebody new is still refused, which the link has said.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'newcomer');
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, %L, 60) $$, :'ivy', :'newcomer', :'lesson_type', pg_temp.at(3, '12:00')),
  'P0001', 'LEARNER_LIMIT',
  'somebody new is not taken on by booking on a full list'
);
select is(
  (public.booking_page('ivy-full-list') ->> 'takingNewLearners')::boolean,
  false,
  'and the link had told them so'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- A learner moving with their instructor comes as an enquiry (D-360).
-- ---------------------------------------------------------------------------------------
insert into public.learner_moves (learner_id, from_business_id, to_business_id, instructor_id, reason)
values (:'mover', :'asha_biz', :'school', :'ivy', 'joined_school');
select lives_ok(
  format($$ select private.settle_learner_move((select id from public.learner_moves where learner_id = %L), true, false) $$, :'mover'),
  'saying yes to moving to a full list is not refused'
);
select is(
  (select status::text from public.learner_relationships where business_id = :'school' and learner_id = :'mover'),
  'enquiry',
  'they come as an enquiry, counted once there is room'
);

-- With room again, the link takes somebody new.
update public.platform_settings set value = '{"active_learners": 10000}' where key = 'free_plan_limits';
select is(
  (public.booking_page('ivy-full-list') ->> 'takingNewLearners')::boolean,
  true,
  'with room, the link takes somebody new again'
);

select * from finish();
rollback;
