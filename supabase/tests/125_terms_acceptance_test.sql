-- Agreeing to the terms and the privacy notice, on the record (NFR-PRV-02, PRD 15, D-265).
begin;
select plan(11);

\set sam 'f0000000-0000-0000-0000-000000000001'
\set nia 'f0000000-0000-0000-0000-000000000002'
\set odd 'f0000000-0000-0000-0000-000000000003'

-- Ticked on the sign-up form, and sent with the account.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', :'sam', 'authenticated', 'authenticated', 'sam.signup@example.com', '',
        '{"provider": "email"}', '{"full_name": "Sam Signup", "terms_version": "2026-09-30"}', now(), now());
select results_eq(
  format($$ select terms_version, terms_accepted_at is not null from public.users where id = %L $$, :'sam'),
  $$ values ('2026-09-30', true) $$,
  'the version ticked at sign-up is written down as the account is made'
);

-- Signed up some other way, or from before: nothing agreed yet.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', :'nia', 'authenticated', 'authenticated', 'nia.google@example.com', '',
        '{"provider": "google"}', '{"name": "Nia Google"}', now(), now());
select is((select terms_version from public.users where id = :'nia'), null, 'an account made without the tick has agreed to nothing');

-- Anything that is not a version is not agreeing.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', :'odd', 'authenticated', 'authenticated', 'odd@example.com', '',
        '{"provider": "email"}', '{"full_name": "Odd", "terms_version": "yes"}', now(), now());
select is((select terms_version from public.users where id = :'odd'), null, 'and "yes" is not a version');

-- ---------------------------------------------------------------------------------------
-- Agreeing on the screen that asks.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'nia');
select lives_ok($$ select public.accept_terms('2026-09-30') $$, 'somebody agrees on the screen that asks them');
select throws_ok($$ select public.accept_terms('whenever') $$, 'P0001', 'VALIDATION_FAILED', 'to a version, not to anything else');
select lives_ok($$ select public.accept_terms('2026-09-30') $$, 'and agreeing to the same version again is harmless');
select throws_ok(
  format($$ update public.users set terms_version = '2030-01-01', terms_accepted_at = now() where id = %L $$, :'nia'),
  '42501', null,
  'nobody writes the record directly: there is no grant on those columns'
);

select tests.clear_authentication();
select results_eq(
  format($$ select terms_version, terms_accepted_at is not null from public.users where id = %L $$, :'nia'),
  $$ values ('2026-09-30', true) $$,
  'which is written down with when'
);
select is(
  (select count(*)::int from public.audit_log where action = 'account.terms_accepted' and entity_id = :'nia'),
  1,
  'once in the audit log, however often it is agreed to'
);
select throws_ok(
  format($$ update public.users set terms_accepted_at = null where id = %L $$, :'nia'),
  '23514', null,
  'and a version is never kept without when it was agreed to'
);

select tests.authenticate_as_anon();
select throws_ok($$ select public.accept_terms('2026-09-30') $$, '42501', null, 'nobody signed out can agree for anybody');
select tests.clear_authentication();

select * from finish();
rollback;
