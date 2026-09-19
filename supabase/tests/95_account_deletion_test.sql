-- Deleting an account: the person goes, the money stays (NFR-PRV-03, AUTH-09, M6-12, D-149).
begin;
select plan(17);

select tests.create_fixture();

\set lee 'c0000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'

-- What Lee has before any of this: a name, a licence number, a note about them, a device, and a
-- payment their Business must keep for six years.
update public.learner_private set date_of_birth = date '2006-05-04', licence_number_encrypted = 'v1:ciphertext' where user_id = :'lee';
insert into public.learner_notes (business_id, learner_id, author_id, body)
values ('aaaa0000-0000-0000-0000-000000000000', :'lee', :'asha_user', 'Nervous at roundabouts');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values (:'lee', 'https://push.example.test/lee-device', 'a-public-key-long-enough', 'an-auth-secret-too');
insert into public.payments (business_id, learner_id, payer_id, amount_pence, method, status)
values ('aaaa0000-0000-0000-0000-000000000000', :'lee', :'lee', 4200, 'card', 'paid');

-- A request, then a change of mind.
select tests.authenticate_as(:'lee');
select isnt((select public.request_account_deletion('Not learning any more')), null, 'a person can ask for their account to go');
select is((select public.cancel_account_deletion())::text, 'true', 'and can change their mind while it waits');
select is(
  (select status from public.deletion_requests where user_id = :'lee' order by requested_at desc limit 1),
  'cancelled',
  'which leaves the request cancelled'
);
select is((select public.cancel_account_deletion())::text, 'false', 'and there is nothing to cancel twice');

-- Asked again, and this time left to run.
select isnt((select public.request_account_deletion(null)), null, 'they ask again');
select tests.clear_authentication();

-- Nothing happens for seven days. Counted for this learner only: an end to end run leaves its own
-- requests in this database, and a count of everybody's would be a count of those too.
select is(
  (select count(*)::int from public.system_due_deletions(now() + interval '6 days') where user_id = :'lee'),
  0,
  'nothing is due after six days'
);
select is(
  (select count(*)::int from public.system_due_deletions(now() + interval '8 days') where user_id = :'lee'),
  1,
  'and it is due after eight'
);

-- Carried out, theirs and nobody else's.
select public.system_finish_deletion(
  (select request_id from public.system_due_deletions(now() + interval '8 days') where user_id = :'lee' limit 1)
);

select is(
  (select full_name from public.users where id = :'lee'),
  'Deleted account',
  'their name is gone from our own records'
);
select ok(
  (select email is null and phone is null and deleted_at is not null from public.users where id = :'lee'),
  'and their contact details with it'
);
select is(
  (select count(*)::int from public.learner_private where user_id = :'lee'),
  0,
  'their date of birth and licence number are gone'
);
select is(
  (select count(*)::int from public.learner_notes where learner_id = :'lee'),
  0,
  'so are the notes a Business wrote about them'
);
select is(
  (select count(*)::int from public.push_subscriptions where user_id = :'lee'),
  0,
  'and the devices they were told on'
);

-- The money stays, because the law says it must.
select is(
  (select count(*)::int from public.payments where learner_id = :'lee' and amount_pence = 4200),
  1,
  'the payment is still there, for the six years HMRC asks for'
);

-- And nobody can sign in as them again.
select ok(
  (select banned_until > now() + interval '900 years' from auth.users where id = :'lee'),
  'the account is banned for good, which refuses a new sign in and ends every session (D-126)'
);
select ok(
  (select encrypted_password is null and email like 'deleted+%@invalid' from auth.users where id = :'lee'),
  'with nothing left to sign in with'
);
select is(
  (select count(*)::int from auth.sessions where user_id = :'lee'),
  0,
  'and every session already open is gone'
);

-- Written down, as every account decision is (NFR-SEC-06).
select is(
  (select count(*)::int from public.audit_log where action = 'account.deleted' and entity_id = :'lee'),
  1,
  'the deletion is in the audit trail'
);

select * from finish();
rollback;
