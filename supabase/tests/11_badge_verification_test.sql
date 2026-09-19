-- Badge photos are private, and verification is decided by staff, not the applicant
-- (INS-02, AUTH-04, M1-04).
begin;
select plan(14);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'

select tests.create_user('staff.badge@test.local', 'Sam Support') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');

-- The bucket
select is((select public from storage.buckets where id = 'badges'), false, 'badge photos are not public');
select is(
  (select allowed_mime_types from storage.buckets where id = 'badges'),
  array['image/webp'],
  'and only the type the browser produces is stored'
);

-- Nobody sets their own verification status.
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ update public.instructor_profiles set verification_status = 'approved' where id = %L $$, :'asha'),
  '42501',
  null,
  'an instructor cannot approve themselves: there is no grant on the column'
);
select throws_ok(
  format($$ update public.instructor_profiles set badge_number = '999999' where id = %L $$, :'asha'),
  '42501',
  null,
  'and cannot edit the badge number directly: it goes through the submission'
);

-- Submitting
select is(
  public.submit_verification(:'asha', 'adi', ' ab1234 ', (private.today() + 400)::date, true, null),
  'pending'::public.verification_status,
  'a submission is recorded as waiting for review'
);
select is(
  (select badge_number from public.instructor_profiles where id = :'asha'),
  'AB1234',
  'the number is stored as it is printed'
);
select ok(
  (select verification_submitted_at is not null and verified_at is null from public.instructor_profiles where id = :'asha'),
  'and the submission is timed but not yet decided'
);
-- The audit log and the outbox are not readable through the API at all, so check them as the
-- test runner rather than as the person who was just verified.
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log where action = 'instructor.verification_submitted' and entity_id = :'asha'),
  1,
  'every submission leaves an audit row'
);
select is(
  (select count(*)::int from public.outbox_events
    where name = 'instructor/verification-submitted'
      and payload ->> 'instructor_profile_id' = :'asha'),
  1,
  'and asks for someone to review it, outside the transaction'
);

select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '123456', (private.today() - 1)::date, true, null) $$, :'asha'),
  'P0001',
  'VALIDATION_FAILED',
  'an expired badge is refused'
);
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '123456', (private.today() + 400)::date, false, null) $$, :'asha'),
  'P0001',
  'VALIDATION_FAILED',
  'and so is a submission without the DBS confirmation'
);
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '123456', (private.today() + 400)::date, true, null) $$, :'ian'),
  '42501',
  'NOT_ALLOWED',
  'one instructor cannot submit for another'
);

-- Badge photos
select tests.clear_authentication();
insert into storage.objects (bucket_id, name, owner) values ('badges', :'asha' || '/badge.webp', :'asha_user');

select tests.authenticate_as(:'ivy_user');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'badges' and name = :'asha' || '/badge.webp'),
  0,
  'an instructor in another business cannot read the badge photo'
);

-- Staff need two-step verification before they see anything (AUTH-08).
select tests.authenticate_as(:'staff', 'aal2');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'badges' and name = :'asha' || '/badge.webp'),
  1,
  'platform staff can, because they are the ones checking it'
);

select * from finish();
rollback;
