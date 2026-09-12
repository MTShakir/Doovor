-- Only platform staff decide a verification, and every decision is recorded
-- (INS-02, ADM-03, M1-12).
begin;
select plan(11);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set owner_user 'b0000000-0000-0000-0000-000000000001'

select tests.create_user('staff.decide@test.local', 'Sam Support') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');

-- Something waiting to be decided.
select tests.authenticate_as(:'asha_user');
select public.submit_verification(:'asha', 'adi', '416234', (current_date + 400)::date, true, null) as submitted \gset

-- Who may not decide
select throws_ok(
  format($$ select public.decide_verification(%L, true, null) $$, :'asha'),
  '42501',
  'NOT_ALLOWED',
  'an instructor cannot approve their own badge'
);
select tests.authenticate_as(:'owner_user');
select throws_ok(
  format($$ select public.decide_verification(%L, true, null) $$, :'asha'),
  '42501',
  'NOT_ALLOWED',
  'nor can a school owner approve anyone'
);

-- Staff without two-step verification are not staff for this purpose (AUTH-08).
select tests.authenticate_as(:'staff');
select throws_ok(
  format($$ select public.decide_verification(%L, true, null) $$, :'asha'),
  '42501',
  'NOT_ALLOWED',
  'staff signed in without two-step verification cannot decide either'
);

select tests.authenticate_as(:'staff', 'aal2');
select is(
  public.decide_verification(:'asha', true, null),
  'approved'::public.verification_status,
  'staff with two-step verification approve a badge'
);
select ok(
  (select verified_at is not null from public.instructor_profiles where id = :'asha'),
  'and the tick is dated'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log
    where action = 'instructor.verification_decided' and entity_id = :'asha'),
  1,
  'every decision leaves an audit row saying who made it'
);
select is(
  (select count(*)::int from public.outbox_events
    where name = 'instructor/verification-decided' and payload ->> 'instructor_profile_id' = :'asha'),
  1,
  'and the instructor is told, outside the transaction'
);

-- Rejection
select tests.authenticate_as(:'staff', 'aal2');
select throws_ok(
  format($$ select public.decide_verification(%L, false, '   ') $$, :'ian'),
  'P0001',
  'VALIDATION_FAILED',
  'a rejection has to say why: the instructor is told the reason'
);
select is(
  public.decide_verification(:'ian', false, 'The badge photo is too blurred to read.'),
  'rejected'::public.verification_status,
  'a rejection with a reason is recorded'
);
select is(
  (select verification_decision_reason from public.instructor_profiles where id = :'ian'),
  'The badge photo is too blurred to read.',
  'and the reason is kept'
);
select ok(
  (select verified_at is null from public.instructor_profiles where id = :'ian'),
  'a rejected instructor has no tick'
);

select * from finish();
rollback;
