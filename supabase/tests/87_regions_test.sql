-- Regions: supply and demand in each postcode area against the switch-on rule, and opening or
-- closing the marketplace there (ADM-04, PRD 4.2, M5-19).
--
-- Supply is held still at midnight on Monday 1 March 2021, long before anything real, so the only
-- hours in its 14 days are the ones made here. The areas are the Shetland and Outer Hebrides ones,
-- which nothing else in the database uses.
begin;
select plan(27);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_profile 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'a2000000-0000-0000-0000-000000000001'
\set super 'e0000000-0000-0000-0000-000000000040'
\set support 'e0000000-0000-0000-0000-000000000041'
\set now '2021-03-01T00:00:00Z'

select tests.create_user_with_id(:'super', 'super.regions@test.local', 'Sue Super');
select tests.create_user_with_id(:'support', 'support.regions@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'super', 'super_admin'), (:'support', 'support_admin');

-- Three instructors search may show: Asha and Ian are based in ZE, and Ivy is based in HS and also
-- covers the ZE3 district.
update public.instructor_profiles
   set verification_status = 'approved', verified_at = now(), badge_expiry = '2099-01-01', is_listed = true
 where id in (:'asha_profile', :'ian', :'ivy');
update public.instructor_profiles set base_postcode = 'ZE1 0AA' where id = :'asha_profile';
update public.instructor_profiles set base_postcode = 'ZE2 9XX' where id = :'ian';
update public.instructor_profiles set base_postcode = 'HS1 2AA' where id = :'ivy';
insert into public.coverage_districts (instructor_id, business_id, outcode, rule) values (:'ivy', :'school', 'ZE3', 'include');

-- Asha is open 09:00 to 17:00 on weekdays, 80 hours in the 14 days, less a lesson with its half-hour
-- buffer and a day off; Ian is open 09:00 to 12:00 on Mondays, 6 hours; Ivy has no hours at all.
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'asha_profile', :'asha_biz', d, '09:00', '17:00' from generate_series(1, 5) as d;
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time) values (:'ian', :'school', 1, '09:00', '12:00');
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source)
values (:'asha_biz', :'asha_profile', :'lee', :'lesson_type', '2021-03-02T10:00:00Z', '2021-03-02T11:00:00Z', 30, 'confirmed', 'unpaid', 4000, 'instructor');
insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at)
values (:'asha_profile', :'asha_biz', 'blocked', '2021-03-03T09:00:00Z', '2021-03-03T17:00:00Z');

-- Demand in ZE: one place on the waiting list and one left, one lesson request and one withdrawn.
insert into public.area_waiting_list (postcode, postcode_area, full_name, email, consent_wording) values
  ('ZE1 0AB', 'ZE', 'Wendy Wait', 'wendy.wait@test.local', 'Keep my details and email me.'),
  ('ZE1 0AC', 'ZE', 'Len Left', 'len.left@test.local', 'Keep my details and email me.');
update public.area_waiting_list set left_at = now() where email = 'len.left@test.local';
insert into public.lesson_requests (postcode, postcode_area, full_name, email, transmission, experience, days, times, start_when, consent_wording) values
  ('ZE2 1AA', 'ZE', 'Rita Request', 'rita.request@test.local', 'manual', 'none', array[1]::smallint[], array['morning'], 'now', 'Keep my request.'),
  ('ZE2 1AB', 'ZE', 'Will Withdrawn', 'will.withdrawn@test.local', 'manual', 'none', array[1]::smallint[], array['morning'], 'now', 'Keep my request.');
update public.lesson_requests set withdrawn_at = now() where email = 'will.withdrawn@test.local';

create or replace function pg_temp.region(p_facts jsonb, p_area text) returns jsonb language sql as $$
  select r from jsonb_array_elements(p_facts -> 'regions') as r where r ->> 'area' = p_area;
$$;

select private.region_facts(:'now') as facts \gset

-- ---------------------------------------------------------------------------------------
-- Supply and demand.
-- ---------------------------------------------------------------------------------------
select results_eq(
  format($$ select (r ->> 'instructors')::int, (r ->> 'free_minutes')::int, (r ->> 'waiting')::int, (r ->> 'requests')::int, (r ->> 'open')::boolean
              from (select pg_temp.region(%L::jsonb, 'ZE') as r) as x $$, :'facts'),
  $$ values (3, 4590, 1, 1, false) $$,
  'ZE: three instructors cover it, by their base or a district they add, with 76.5 free hours in the 14 days, one waiting and one request (ADM-04, PRD 4.2)'
);
select results_eq(
  format($$ select (r ->> 'instructors')::int, (r ->> 'free_minutes')::int, (r ->> 'waiting')::int, (r ->> 'requests')::int
              from (select pg_temp.region(%L::jsonb, 'HS') as r) as x $$, :'facts'),
  $$ values (1, 0, 0, 0) $$,
  'HS: Ivy alone, with no hours'
);
select results_eq(
  format($$ select (%L::jsonb -> 'rule' ->> 'instructors')::int, (%L::jsonb -> 'rule' ->> 'hours')::int $$, :'facts', :'facts'),
  $$ values (25, 150) $$,
  'with the switch-on rule as the platform settings have it'
);

update public.instructor_profiles set is_listed = false where id = :'ian';
select is(
  (pg_temp.region(private.region_facts(:'now'), 'ZE') ->> 'instructors')::int,
  2,
  'an instructor search does not show is not counted'
);
update public.instructor_profiles set is_listed = true where id = :'ian';
update public.businesses set status = 'suspended' where id = :'asha_biz';
select is(
  (pg_temp.region(private.region_facts(:'now'), 'ZE') ->> 'free_minutes')::int,
  360,
  'nor are the hours of a suspended Business'
);
update public.businesses set status = 'active' where id = :'asha_biz';

-- ---------------------------------------------------------------------------------------
-- Who may look.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select ok(pg_temp.region(public.admin_regions(), 'ZE') is not null, 'support staff see the regions');
select tests.authenticate_as(:'support');
select throws_ok($$ select public.admin_regions() $$, '42501', null, 'not before their second step (AUTH-08)');
select tests.authenticate_as(:'asha', 'aal2');
select throws_ok($$ select public.admin_regions() $$, '42501', null, 'and nobody outside the platform staff');

-- ---------------------------------------------------------------------------------------
-- Opening an area.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select throws_ok($$ select public.admin_set_marketplace_region('ZE', true) $$, '42501', null, 'support staff cannot open an area (PRD 6.2)');
select tests.authenticate_as(:'super');
select throws_ok($$ select public.admin_set_marketplace_region('ZE', true) $$, '42501', null, 'nor a super admin before their second step');

select tests.authenticate_as(:'super', 'aal2');
select throws_ok(
  $$ select public.admin_set_marketplace_region('ZE', true) $$,
  'P0001', 'VALIDATION_FAILED', 'an area short of the switch-on rule does not open'
);
select throws_ok($$ select public.admin_set_marketplace_region('Z9', true) $$, 'P0001', 'VALIDATION_FAILED', 'nor does something that is not a postcode area');

-- The rule as a super admin might set it for an area of few instructors.
select tests.clear_authentication();
update public.platform_settings set value = '{"verified_instructors": 3, "open_hours_14_days": 70}' where key = 'marketplace_switch_on';
select tests.authenticate_as(:'super', 'aal2');
select lives_ok($$ select public.admin_set_marketplace_region('ze', true) $$, 'an area that meets it opens');
select throws_ok($$ select public.admin_set_marketplace_region('ZE', true) $$, 'P0001', 'VALIDATION_FAILED', 'once');

select tests.clear_authentication();
select results_eq(
  $$ select marketplace_enabled, switched_at is not null from public.marketplace_regions where postcode_area = 'ZE' $$,
  $$ values (true, true) $$,
  'the marketplace is open in ZE'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'region.marketplace_opened' and actor_user_id = :'super' and after ->> 'area' = 'ZE'
      and (after ->> 'instructors')::int = 3 and (after ->> 'waiting')::int = 1),
  1,
  'the audit log says who opened it, and what it looked like then (NFR-SEC-06)'
);
select is(
  (select count(*)::int from public.outbox_events where name = 'marketplace_region.opened' and payload ->> 'area' = 'ZE'),
  1,
  'and the people waiting are to be told'
);
select is(pg_temp.region(private.region_facts(now()), 'ZE') ->> 'open', 'true', 'and the regions say so');

-- ---------------------------------------------------------------------------------------
-- Telling the people waiting, once.
-- ---------------------------------------------------------------------------------------
select results_eq(
  $$ select r ->> 'email', r ->> 'kind' from jsonb_array_elements(public.system_region_opened_recipients('ZE')) as r order by r ->> 'email' $$,
  $$ values ('rita.request@test.local', 'lesson_request'), ('wendy.wait@test.local', 'waiting_list') $$,
  'everybody still waiting in ZE, or with a request there, is told, and nobody who left or withdrew'
);
select public.system_mark_told_region_open('ZE', 'WENDY.WAIT@test.local');
select results_eq(
  $$ select left_at is not null, told_open_at is not null from public.area_waiting_list where email = 'wendy.wait@test.local' $$,
  $$ values (true, true) $$,
  'somebody told leaves the waiting list, whose job is done'
);
select results_eq(
  $$ select r ->> 'email' from jsonb_array_elements(public.system_region_opened_recipients('ZE')) as r $$,
  $$ values ('rita.request@test.local') $$,
  'and is not told again'
);
select public.system_mark_told_region_open('ZE', 'rita.request@test.local');
select results_eq(
  $$ select withdrawn_at is null, told_open_at is not null from public.lesson_requests where email = 'rita.request@test.local' $$,
  $$ values (true, true) $$,
  'a lesson request is kept when its sender is told'
);
select tests.authenticate_as(:'super', 'aal2');
select throws_ok($$ select public.system_region_opened_recipients('ZE') $$, '42501', null, 'nobody signed in reads who is waiting');

-- ---------------------------------------------------------------------------------------
-- Closing it.
-- ---------------------------------------------------------------------------------------
select lives_ok($$ select public.admin_set_marketplace_region('ZE', false) $$, 'a super admin closes an area');
select throws_ok($$ select public.admin_set_marketplace_region('ZE', false) $$, 'P0001', 'VALIDATION_FAILED', 'once');
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log where action = 'region.marketplace_closed' and actor_user_id = :'super' and after ->> 'area' = 'ZE'),
  1,
  'which the audit log records too'
);
update public.lesson_requests set told_open_at = null where email = 'rita.request@test.local';
select is(public.system_region_opened_recipients('ZE'), '[]'::jsonb, 'and nobody is told about an area that has closed again');

select * from finish();
rollback;
