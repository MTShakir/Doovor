-- pgTAP and test helpers. Loaded by `supabase db reset` locally and in CI only
-- (config.toml db.seed); hosted projects never run seed files.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- Creates a confirmed email user; the auth trigger creates the public.users row.
create or replace function tests.create_user(p_email text, p_full_name text default '', p_meta jsonb default '{}')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}',
    jsonb_build_object('full_name', p_full_name) || p_meta, now(), now()
  );
  return v_id;
end;
$$;

-- Act as a signed-in user for the rest of the transaction. p_aal 'aal2' simulates TOTP.
create or replace function tests.authenticate_as(p_user_id uuid, p_aal text default 'aal1')
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.authenticate_as_anon()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Back to the test runner's own role (postgres), which bypasses RLS for setup.
create or replace function tests.clear_authentication()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- Also one that can sign in through the app with the seed's password, as the e2e tests' own
-- instructors do (M5-07): the auth server reads its token columns as text, never null, and finds
-- an email sign-in by its identity.
create or replace function tests.create_user_with_id(p_id uuid, p_email text, p_full_name text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', jsonb_build_object('full_name', p_full_name), now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (p_id, p_id::text, 'email', jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), now(), now());
  return p_id;
end;
$$;

/*
  Standard two-tenant fixture with fixed ids:
    Business A  aaaa0000-...  independent. Owner and instructor: a0000000-...-001, profile a1000000-...-001
    Business B  bbbb0000-...  school. Owner b0000000-...-001, manager -002,
                instructors -003 (profile b1000000-...-001) and -004 (profile b1000000-...-002)
    Learner 1   c0000000-...-001  linked to A (instructor A) and B (instructor B1), born 2000
    Learner 2   c0000000-...-002  linked to B (instructor B2), aged 17
    Learner 3   c0000000-...-003  not linked to anyone
    Outsider    d0000000-...-001  no memberships
    Lesson types a2000000-...-001 (A) and b2000000-...-001 (B)
*/
create or replace function tests.create_fixture()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform tests.create_user_with_id('a0000000-0000-0000-0000-000000000001', 'owner.a@test.local', 'Asha Instructor');
  perform tests.create_user_with_id('b0000000-0000-0000-0000-000000000001', 'owner.b@test.local', 'Ben Owner');
  perform tests.create_user_with_id('b0000000-0000-0000-0000-000000000002', 'manager.b@test.local', 'Mia Manager');
  perform tests.create_user_with_id('b0000000-0000-0000-0000-000000000003', 'instructor.b1@test.local', 'Ian One');
  perform tests.create_user_with_id('b0000000-0000-0000-0000-000000000004', 'instructor.b2@test.local', 'Ivy Two');
  perform tests.create_user_with_id('c0000000-0000-0000-0000-000000000001', 'learner.1@test.local', 'Lee One');
  perform tests.create_user_with_id('c0000000-0000-0000-0000-000000000002', 'learner.2@test.local', 'Lou Two');
  perform tests.create_user_with_id('c0000000-0000-0000-0000-000000000003', 'learner.3@test.local', 'Liz Three');
  perform tests.create_user_with_id('d0000000-0000-0000-0000-000000000001', 'outsider@test.local', 'Otto Side');

  insert into public.businesses (id, type, name, slug) values
    ('aaaa0000-0000-0000-0000-000000000000', 'independent', 'Asha Driving', 'asha-driving'),
    ('bbbb0000-0000-0000-0000-000000000000', 'school', 'Bee School', 'bee-school');

  insert into public.memberships (business_id, user_id, role) values
    ('aaaa0000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001', 'owner'),
    ('bbbb0000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'owner'),
    ('bbbb0000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'manager'),
    ('bbbb0000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003', 'instructor'),
    ('bbbb0000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000004', 'instructor');

  insert into public.instructor_profiles (id, user_id, business_id, display_name, badge_number) values
    ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000000', 'Asha', '123456'),
    ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-000000000000', 'Ian', '234567'),
    ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-000000000000', 'Ivy', '345678');

  insert into public.learner_profiles (user_id, transmission) values
    ('c0000000-0000-0000-0000-000000000001', 'manual'),
    ('c0000000-0000-0000-0000-000000000002', 'automatic'),
    ('c0000000-0000-0000-0000-000000000003', 'manual');

  insert into public.learner_private (user_id, date_of_birth) values
    ('c0000000-0000-0000-0000-000000000001', '2000-05-01'),
    ('c0000000-0000-0000-0000-000000000002', (current_date - interval '17 years')::date);

  insert into public.learner_relationships (business_id, learner_id, instructor_id) values
    ('aaaa0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001'),
    ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001'),
    ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002');

  insert into public.lesson_types (id, business_id, name) values
    ('a2000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000000', 'Standard lesson'),
    ('b2000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000000', 'Standard lesson');
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
