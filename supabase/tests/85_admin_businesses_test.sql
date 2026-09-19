-- Finding, suspending and reactivating a Business (ADM-02, M5-18).
begin;
select plan(34);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set asha_type 'a2000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set super 'e0000000-0000-0000-0000-000000000020'
\set support 'e0000000-0000-0000-0000-000000000021'

select tests.create_user_with_id(:'super', 'super.suspends@test.local', 'Sue Super');
select tests.create_user_with_id(:'support', 'support.looks@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'super', 'super_admin'), (:'support', 'support_admin');

-- Asha takes bookings through her link, with an hour's lesson, open every day, and a lesson to come.
update public.businesses set base_postcode = 'ZZ99 9ZZ' where id = :'asha_biz';
update public.users set phone = '447700911222' where id = :'ben';
update public.instructor_profiles
   set verification_status = 'approved', verified_at = now(), public_slug = 'asha-drives-m5-18', badge_expiry = private.today() + 365
 where id = :'asha_profile';
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence) values (:'asha_biz', :'asha_type', 60, 4000);
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source)
values (:'asha_biz', :'asha_profile', :'lee', :'asha_type', now() + interval '20 days', now() + interval '20 days 1 hour', 0, 'confirmed', 'unpaid', 4000, 'instructor');
select id as booked from public.bookings where business_id = :'asha_biz' \gset

select tests.authenticate_as(:'asha');
select public.set_working_hours(:'asha_profile', array[1, 2, 3, 4, 5, 6, 7]::smallint[], '09:00', '17:00');

-- ---------------------------------------------------------------------------------------
-- Finding a Business, and who may look.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select results_eq(
  $$ select name, type::text, status::text from public.admin_businesses('Bee Sch') $$,
  $$ values ('Bee School', 'school', 'active') $$,
  'support staff find a Business by part of its name (ADM-02)'
);
select results_eq(
  $$ select name, owner_name, owner_email from public.admin_businesses('OWNER.B@test') $$,
  $$ values ('Bee School', 'Ben Owner', 'owner.b@test.local') $$,
  'or by the email of somebody who runs it, with its owner'
);
select results_eq(
  $$ select name from public.admin_businesses('07700 911222') $$,
  $$ values ('Bee School') $$,
  'or by their mobile, written the way people write it'
);
select results_eq(
  $$ select name from public.admin_businesses('zz999zz') $$,
  $$ values ('Asha Driving') $$,
  'or by its postcode, written any way'
);
select is(
  (select count(*)::int from public.admin_businesses('100%_off')),
  0,
  'and a percent sign or underscore is looked for as itself'
);
select ok(
  (select count(*) from public.admin_businesses(null)) between 2 and 25,
  'with nothing typed, the newest Businesses, 25 at most'
);
select results_eq(
  format($$ select d ->> 'name', d ->> 'type', d ->> 'status', jsonb_array_length(d -> 'members'), (d ->> 'learners')::int,
                  (d ->> 'lessons_to_come')::int, d ->> 'suspension_reason'
              from (select public.admin_business(%L) as d) as x $$, :'asha_biz'),
  $$ values ('Asha Driving', 'independent', 'active', 1, 1, 1, null::text) $$,
  'and open one to see who works there, its learners and its lessons to come'
);
select results_eq(
  format($$ select m ->> 'name', m ->> 'role', (m ->> 'active')::boolean
              from jsonb_array_elements(public.admin_business(%L) -> 'members') as m
             order by m ->> 'name' $$, :'school'),
  $$ values ('Ben Owner', 'owner', true), ('Ian One', 'instructor', true), ('Ivy Two', 'instructor', true), ('Mia Manager', 'manager', true) $$,
  'a school lists everybody in it, with their role'
);
select is(public.admin_business('00000000-0000-0000-0000-000000000000'), null, 'a Business that does not exist is nothing');

select tests.authenticate_as(:'support');
select throws_ok($$ select * from public.admin_businesses('Bee') $$, '42501', null, 'staff cannot look before their second step (AUTH-08)');
select throws_ok(format($$ select public.admin_business(%L) $$, :'school'), '42501', null, 'nor open one');
select tests.authenticate_as(:'ben', 'aal2');
select throws_ok($$ select * from public.admin_businesses('Bee') $$, '42501', null, 'and the owner of a school cannot look at all');

-- ---------------------------------------------------------------------------------------
-- Suspending.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select ok((select count(*) from public.open_slots(:'asha_profile', private.today() + 3, 60)) > 0, 'before, a learner sees Asha''s free times');

select tests.authenticate_as(:'support', 'aal2');
select throws_ok(
  format($$ select public.admin_set_business_suspended(%L, true, 'Fake badge') $$, :'asha_biz'),
  '42501', null, 'support staff cannot suspend a Business'
);
select tests.authenticate_as(:'super');
select throws_ok(
  format($$ select public.admin_set_business_suspended(%L, true, 'Fake badge') $$, :'asha_biz'),
  '42501', null, 'nor a super admin before their second step'
);
select tests.authenticate_as(:'super', 'aal2');
select throws_ok(
  format($$ select public.admin_set_business_suspended(%L, true, '   ') $$, :'asha_biz'),
  'P0001', 'VALIDATION_FAILED', 'a suspension says why'
);
select lives_ok(
  format($$ select public.admin_set_business_suspended(%L, true, 'Badge number belongs to somebody else') $$, :'asha_biz'),
  'a super admin suspends a Business'
);
select throws_ok(
  format($$ select public.admin_set_business_suspended(%L, true, 'Again') $$, :'asha_biz'),
  'P0001', 'VALIDATION_FAILED', 'once'
);
select results_eq(
  format($$ select d ->> 'status', d ->> 'suspension_reason', d ->> 'suspended_by_name', d ->> 'suspended_at' is not null
              from (select public.admin_business(%L) as d) as x $$, :'asha_biz'),
  $$ values ('suspended', 'Badge number belongs to somebody else', 'Sue Super', true) $$,
  'staff see that it is suspended, why, by whom and when'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log
    where action = 'business.suspended' and entity_id = :'asha_biz' and actor_user_id = :'super'
      and after ->> 'reason' = 'Badge number belongs to somebody else'),
  1,
  'and the audit log says so (NFR-SEC-06)'
);

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, ((private.today() + 3)::timestamp + time '10:00') at time zone 'Europe/London', 60) $$,
         :'asha_profile', :'lee', :'asha_type'),
  'P0001', 'BUSINESS_SUSPENDED', 'a learner cannot book a lesson with a suspended Business'
);
select is((select count(*)::int from public.open_slots(:'asha_profile', private.today() + 3, 60)), 0, 'and sees no free times');
select throws_ok(
  format($$ select public.hold_booking_for_payment(%L) $$, :'booked'),
  'P0001', 'BUSINESS_SUSPENDED', 'nor pays by card for a lesson already booked'
);
select tests.authenticate_as_anon();
select is(public.booking_page('asha-drives-m5-18'), null, 'its booking link takes no bookings');

select tests.authenticate_as(:'asha');
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, ((private.today() + 3)::timestamp + time '10:00') at time zone 'Europe/London', 60) $$,
         :'asha_profile', :'lee', :'asha_type'),
  'P0001', 'BUSINESS_SUSPENDED', 'nor does the instructor book one for her own learner'
);
select throws_ok(
  $$ select public.create_business('school', 'Asha Starts Again') $$,
  'P0001', 'BUSINESS_SUSPENDED', 'nor start another Business while hers is suspended'
);
select throws_ok(
  $$ select suspension_reason from public.businesses $$,
  '42501', null, 'and nobody signed in reads why a Business was suspended, straight from the table'
);

-- ---------------------------------------------------------------------------------------
-- Reactivating.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select throws_ok(
  format($$ select public.admin_set_business_suspended(%L, false) $$, :'asha_biz'),
  '42501', null, 'support staff cannot reactivate a Business'
);
select tests.authenticate_as(:'super', 'aal2');
select lives_ok(format($$ select public.admin_set_business_suspended(%L, false) $$, :'asha_biz'), 'a super admin reactivates it');
select throws_ok(
  format($$ select public.admin_set_business_suspended(%L, false) $$, :'asha_biz'),
  'P0001', 'VALIDATION_FAILED', 'once'
);
select tests.clear_authentication();
select results_eq(
  format($$ select status::text, suspended_at, suspended_by, suspension_reason from public.businesses where id = %L $$, :'asha_biz'),
  $$ values ('active', null::timestamptz, null::uuid, null::text) $$,
  'which is in good standing again, with the suspension cleared'
);
select is(
  (select count(*)::int from public.audit_log where action = 'business.reactivated' and entity_id = :'asha_biz' and actor_user_id = :'super'),
  1,
  'in the audit log too'
);

select tests.authenticate_as(:'lee');
select lives_ok(
  format($$ select public.create_booking(%L, %L, %L, ((private.today() + 3)::timestamp + time '10:00') at time zone 'Europe/London', 60) $$,
         :'asha_profile', :'lee', :'asha_type'),
  'and a learner books with it again'
);
select tests.authenticate_as_anon();
select isnt(public.booking_page('asha-drives-m5-18'), null, 'through its booking link');

select * from finish();
rollback;
