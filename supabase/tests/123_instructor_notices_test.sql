-- What an instructor, and the school they teach for, are told about their badge (NTF-03, INS-03,
-- PRD Appendix B, D-260).
begin;
select plan(9);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set owner_user 'b0000000-0000-0000-0000-000000000001'
\set manager_user 'b0000000-0000-0000-0000-000000000002'

select tests.create_user('staff.notices@test.local', 'Sam Support') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');

update public.instructor_profiles set badge_expiry = date '2027-03-31' where id = :'ian';

-- Ian teaches for a school, so its owner and manager hear as well. Ian is not told twice.
select tests.clear_authentication();
select is(
  public.system_instructor_notice(:'ian') -> 'school_staff_ids',
  jsonb_build_array(:'owner_user', :'manager_user'),
  'a school instructor''s notices go to the school''s owner and manager too'
);
select is(
  public.system_instructor_notice(:'asha') -> 'school_staff_ids',
  '[]'::jsonb,
  'and an independent instructor''s go to them alone'
);
select is(
  (public.system_instructor_notice(:'ian') ->> 'badge_expiry'),
  '2027-03-31',
  'with the day the badge runs out'
);

-- A decision, and why, with its own id so a second one is a second notice.
select tests.authenticate_as(:'staff', 'aal2');
select public.decide_verification(:'ian', false, 'The photo is too blurred to read');
select tests.clear_authentication();
select results_eq(
  format($$ select n ->> 'verification_status', n ->> 'reason', n ->> 'name', n ->> 'user_id' from (select public.system_instructor_notice(%L) as n) one $$, :'ian'),
  format($$ values ('rejected', 'The photo is too blurred to read', 'Ian', %L) $$, :'ian_user'),
  'the notice says what was decided, why, and about whom'
);
select is((public.system_instructor_notice(:'ian') ->> 'decisions')::int, 1, 'and which decision it was');

select tests.authenticate_as(:'staff', 'aal2');
select public.decide_verification(:'ian', true, null);
select tests.clear_authentication();
select is((public.system_instructor_notice(:'ian') ->> 'decisions')::int, 2, 'a later decision is a different one');
select is(public.system_instructor_notice(:'ian') ->> 'verification_status', 'approved', 'and says what it was');

select is(public.system_instructor_notice(gen_random_uuid()), null, 'nothing for a profile that is not there');

-- Only the service role reads it.
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.system_instructor_notice(%L) $$, :'ian'),
  '42501', null,
  'nobody signed in can read it'
);
select tests.clear_authentication();

select * from finish();
rollback;
