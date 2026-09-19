-- Everything about you, and nothing about anybody else (NFR-PRV-03, M6-11, D-148).
begin;
select plan(11);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

-- Nobody signed in gets nothing at all.
select tests.clear_authentication();
select throws_ok($$ select public.export_my_data() $$, '42501', null, 'nobody signed in cannot export');

-- A learner's own.
select tests.authenticate_as(:'lee');
select lives_ok($$ select public.export_my_data() $$, 'a learner can export their own data');

select is(
  (select public.export_my_data() -> 'account' ->> 'full_name'),
  (select full_name from public.users where id = :'lee'),
  'it carries their own name'
);
select is(
  (select public.export_my_data() ->> 'account_id'),
  :'lee',
  'and says whose account it is'
);
select ok(
  (select public.export_my_data() -> 'learner' -> 'businesses' is not null),
  'a learner gets the Businesses they learn with'
);
select ok(
  (select public.export_my_data() -> 'instructor' is null),
  'and nothing about teaching, because they do not teach'
);

-- A licence number is ciphertext this function cannot read, so it says only whether one is held.
update public.learner_private set licence_number_encrypted = 'v1:not-a-real-one' where user_id = :'lee';
select is(
  (select public.export_my_data() -> 'learner' -> 'private' ->> 'licence_number_held'),
  'true',
  'it says a licence number is held'
);
select is(
  (select (public.export_my_data()::text like '%not-a-real-one%')::text),
  'false',
  'and never prints it, encrypted or otherwise'
);

-- Nothing of anybody else's, however much of it there is.
select ok(
  (
    select not exists (
      select 1
        from jsonb_array_elements(public.export_my_data() -> 'learner' -> 'lessons') as lesson
       where lesson ->> 'instructor' is null
    )
  ),
  'every lesson in it is one of theirs'
);
select is(
  (select jsonb_array_length(public.export_my_data() -> 'learner' -> 'lessons')),
  (select count(*)::int from public.bookings where learner_id = :'lee'),
  'and it has all of them, no more and no fewer'
);

-- Every export is written down (NFR-SEC-06).
select tests.authenticate_as(:'asha_user');
select public.export_my_data();
-- Read with nobody signed in: the trail is for the platform's own staff to read, not its subjects.
select tests.clear_authentication();
select is(
  (
    select count(*)::int
      from public.audit_log
     where action = 'account.data_exported'
       and actor_user_id = :'asha_user'
  ),
  1,
  'an export is written to the audit trail'
);

select * from finish();
rollback;
