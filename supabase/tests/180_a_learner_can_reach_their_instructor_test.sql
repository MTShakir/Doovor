-- A learner can reach their own instructor from the app (BOK-08, LRN-02, D-386).
begin;
select plan(6);

select tests.create_fixture();

\set asha 'aaaa0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Verified mobiles for the three instructors, and one Ivy never verified.
update public.users set phone = '+447700900101', phone_verified_at = now() where id = :'asha_user';
update public.users set phone = '+447700900102', phone_verified_at = now() where id = :'ian_user';
update public.users set phone = '+447700900103', phone_verified_at = null where id = :'ivy_user';

-- Lee learns with Asha and with Ian at the school.
select tests.authenticate_as(:'lee');
select results_eq(
  $$ select instructor_id, phone from public.my_instructors_contact() order by phone $$,
  format($$ values (%L::uuid, '+447700900101'), (%L::uuid, '+447700900102') $$, :'asha_profile', :'ian'),
  'a learner gets the mobile of each instructor who teaches them'
);

-- A cover lesson with Ivy: her number is not verified, so it is not given.
select tests.clear_authentication();
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ivy', :'lee', :'lesson_type', now() + interval '3 days', now() + interval '3 days 1 hour',
        0, 'confirmed', 4200, 'instructor');
select tests.authenticate_as(:'lee');
select is(
  (select count(*)::int from public.my_instructors_contact() where instructor_id = :'ivy'),
  0,
  'a number nobody verified is not passed on'
);
select tests.clear_authentication();
update public.users set phone_verified_at = now() where id = :'ivy_user';
select tests.authenticate_as(:'lee');
select is(
  (select phone from public.my_instructors_contact() where instructor_id = :'ivy'),
  '+447700900103',
  'once it is, the instructor of a lesson they have is somebody they can reach'
);

-- Somebody who has left is told nothing, and nor is anybody an instructor does not teach.
select tests.clear_authentication();
update public.learner_relationships set status = 'left' where learner_id = :'lee' and business_id = :'asha';
select tests.authenticate_as(:'lee');
select is(
  (select count(*)::int from public.my_instructors_contact() where instructor_id = :'asha_profile'),
  0,
  'a learner who has left loses the number'
);
select tests.authenticate_as(:'liz');
select is_empty($$ select 1 from public.my_instructors_contact() $$, 'a learner of nobody here reaches nobody');

select tests.authenticate_as_anon();
select throws_ok(
  $$ select * from public.my_instructors_contact() $$,
  '42501', null,
  'and nobody signed out can ask'
);

select * from finish();
rollback;
