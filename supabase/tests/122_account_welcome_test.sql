-- A welcome, once somebody's email is confirmed (NTF-03, NTF-06, D-259).
begin;
select plan(10);

delete from public.outbox_events;

\set ian 'e0000000-0000-0000-0000-000000000001'
\set gita 'e0000000-0000-0000-0000-000000000002'

-- Signed up with an email and a password: not confirmed yet, so nobody is welcomed.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', :'ian', 'authenticated', 'authenticated', 'new.instructor@example.com',
  extensions.crypt('Password123!', extensions.gen_salt('bf')), null,
  '{"provider": "email", "providers": ["email"]}', '{"full_name": "Ian Newcomer", "intended_role": "instructor"}', now(), now()
);

select is(
  (select count(*)::int from public.outbox_events where name = 'account/email-confirmed'),
  0,
  'signing up is not a welcome yet'
);

-- Confirming the email is.
update auth.users set email_confirmed_at = now() where id = :'ian';
select results_eq(
  $$ select payload ->> 'user_id' from public.outbox_events where name = 'account/email-confirmed' $$,
  format($$ values (%L) $$, :'ian'),
  'confirming the email queues the welcome'
);

-- Once: confirming a changed address later is not a new account.
update auth.users set email = 'ian.newcomer@example.com', email_confirmed_at = now() + interval '1 day' where id = :'ian';
select is(
  (select count(*)::int from public.outbox_events where payload ->> 'user_id' = :'ian'),
  1,
  'and confirming a changed address does not welcome them again'
);

-- Google confirms the address itself, so that person is welcomed as they arrive.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', :'gita', 'authenticated', 'authenticated', 'gita@example.com',
  '', now(), '{"provider": "google", "providers": ["google"]}', '{"name": "Gita Google"}', now(), now()
);
select is(
  (select count(*)::int from public.outbox_events where payload ->> 'user_id' = :'gita'),
  1,
  'signing up with Google is welcomed at once'
);

-- An account made with its email already confirmed is a seed or staff, and is not.
select tests.create_user('seeded@example.com', 'Seeded Person') as seeded \gset
select is(
  (select count(*)::int from public.outbox_events where payload ->> 'user_id' = :'seeded'),
  0,
  'an account made already confirmed is not welcomed'
);

-- What the job reads.
select is(
  public.system_welcome_notice(:'ian'),
  jsonb_build_object('user_id', :'ian', 'full_name', 'Ian Newcomer', 'audience', 'instructor'),
  'the job reads their name and the side they signed up for'
);
select is(public.system_welcome_notice(:'gita') ->> 'audience', 'learner', 'and somebody who never chose a side is a learner');
select is(public.system_welcome_notice(gen_random_uuid()), null, 'and nothing for an account that is not there');

-- Staff are not welcomed as learners, or at all (D-370).
insert into public.platform_staff (user_id, role) values (:'gita', 'support_admin');
select is(public.system_welcome_notice(:'gita'), null, 'nobody on the platform staff is welcomed');

-- Only the service role reads it.
select tests.authenticate_as(:'ian');
select throws_ok(
  format($$ select public.system_welcome_notice(%L) $$, :'ian'),
  '42501', null,
  'nobody signed in can read it'
);
select tests.clear_authentication();

select * from finish();
rollback;
