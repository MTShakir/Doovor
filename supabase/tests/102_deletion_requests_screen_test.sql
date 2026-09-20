-- Who has asked to leave, for staff to read and answer (AUTH-09, ADM-02, D-175).
begin;
select plan(11);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set super 'e0000000-0000-0000-0000-000000000020'
\set support 'e0000000-0000-0000-0000-000000000021'

select tests.create_user_with_id(:'super', 'super.deletions@test.local', 'Sky Super');
select tests.create_user_with_id(:'support', 'support.deletions@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'super', 'super_admin'), (:'support', 'support_admin');

-- Lee asks to leave and says why; Lou asks and says nothing.
select tests.authenticate_as(:'lee');
select public.request_account_deletion('Passed my test, thank you') as lee_request \gset
select tests.authenticate_as(:'lou');
select public.request_account_deletion(null) as lou_request \gset

-- ---------------------------------------------------------------------------------------
-- What staff see.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'support', 'aal2');
select is(
  (select count(*)::int from public.admin_deletion_requests()),
  2,
  'support staff see everybody waiting to be erased'
);
select results_eq(
  $$ select full_name, reason, status from public.admin_deletion_requests() where email = 'learner.1@test.local' $$,
  $$ values ('Lee One'::text, 'Passed my test, thank you'::text, 'pending'::text) $$,
  'with who they are, why they are going and where the request stands'
);
select is(
  (select (erases_at - requested_at) from public.admin_deletion_requests() limit 1),
  interval '7 days',
  'and the day the account is erased if nobody acts'
);
select ok(
  (select bool_and(reason is null) from public.admin_deletion_requests() where email = 'learner.2@test.local'),
  'somebody who said nothing is still on the list'
);

-- ---------------------------------------------------------------------------------------
-- Calling one off.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.admin_cancel_deletion_request(%L, 'Sorted it on the phone') $$, :'lee_request'),
  '42501', 'NOT_ALLOWED', 'support staff do not call a request off'
);

select tests.authenticate_as(:'super', 'aal2');
select throws_ok(
  format($$ select public.admin_cancel_deletion_request(%L, '  ') $$, :'lee_request'),
  'P0001', 'VALIDATION_FAILED', 'nor does anybody without saying why'
);
select lives_ok(
  format($$ select public.admin_cancel_deletion_request(%L, 'Sorted it on the phone: their instructor moved') $$, :'lee_request'),
  'a super admin calls it off'
);
select is(
  (select status from public.deletion_requests where id = :'lee_request'),
  'cancelled',
  'and the request is called off'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'account.deletion_cancelled' and after ->> 'by' = 'staff' and after ->> 'note' like 'Sorted it%'),
  1,
  'with a note in the audit log saying who did it and why'
);
select throws_ok(
  format($$ select public.admin_cancel_deletion_request(%L, 'Again') $$, :'lee_request'),
  'P0002', 'NOT_FOUND', 'calling off what is already off finds nothing'
);

-- ---------------------------------------------------------------------------------------
-- Who may not read the list at all.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben', 'aal2');
select throws_ok(
  $$ select * from public.admin_deletion_requests() $$,
  '42501', 'NOT_ALLOWED', 'the owner of a school reads nobody else''s request'
);

select * from finish();
rollback;
