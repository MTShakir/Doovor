-- Coming soon: the waiting list and lesson requests, kept only with consent, and guarded against
-- being used on anybody else (MKT-10, M5-10, D-117).
begin;
select plan(31);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'

-- Each visitor in this test comes from an address of its own, as the edge in front of the API says.
create or replace function pg_temp.visit_from(p_address text) returns void language sql as $$
  select tests.authenticate_as_anon();
  select set_config('request.headers', json_build_object('x-forwarded-for', p_address || ', 10.0.0.1')::text, true);
$$;

create or replace function pg_temp.waiting(p_email text) returns setof public.area_waiting_list language sql as $$
  select * from public.area_waiting_list where lower(email) = lower(p_email) order by created_at;
$$;

create or replace function pg_temp.confirmations(p_email text) returns integer language sql as $$
  select count(*)::integer from public.outbox_events e
   where e.name = 'learner_capture.created'
     and (e.payload ->> 'id')::uuid in (
       select id from public.area_waiting_list where lower(email) = lower(p_email)
       union all
       select id from public.lesson_requests where lower(email) = lower(p_email)
     );
$$;

select pg_temp.visit_from('198.51.100.1');

select is(
  public.coming_soon_area('ls6 3qs'),
  '{"postcode": "LS6 3QS", "postcodeArea": "LS", "open": false}'::jsonb,
  'a postcode says its area, and that the marketplace is not open there yet'
);
select throws_ok($$ select public.coming_soon_area('not one') $$, 'P0001', 'VALIDATION_FAILED', 'a postcode that is not one is refused');

select is(
  public.join_area_waiting_list('LS6 3QS', 'Lily Learner', 'Lily@Example.com ', 'Email me when I can book instructors near LS.', 'automatic'),
  '{"postcodeArea": "LS"}'::jsonb,
  'anybody may join an area''s waiting list, and hears back only the area'
);

select tests.clear_authentication();
select results_eq(
  $$ select postcode, postcode_area, full_name, email, transmission::text, user_id, consent_wording, left_at is null
       from pg_temp.waiting('lily@example.com') $$,
  $$ values ('LS6 3QS'::text, 'LS'::text, 'Lily Learner'::text, 'lily@example.com'::text, 'automatic'::text, null::uuid,
             'Email me when I can book instructors near LS.'::text, true) $$,
  'the place is kept with the words agreed to, and the address in lower case'
);
select isnt((select consented_at from pg_temp.waiting('lily@example.com')), null, 'with the moment consent was given');
select is(pg_temp.confirmations('lily@example.com'), 1, 'and a confirmation email is asked for');

select pg_temp.visit_from('198.51.100.1');
select is(
  public.join_area_waiting_list('LS6 3QS', 'Lily L', 'LILY@example.com', 'Email me when I can book instructors near LS.'),
  '{"postcodeArea": "LS"}'::jsonb,
  'joining again answers exactly the same, so nobody learns whether an address is on a list'
);
select is(
  public.post_lesson_request('LS6 3QS', 'Lily L', 'lily@example.com', 'automatic', 'none',
                             array[2]::smallint[], array['afternoon'], 'now', 'Email me about my request.'),
  '{"postcodeArea": "LS"}'::jsonb,
  'and the same address may post a lesson request as well'
);
select tests.clear_authentication();
select is((select count(*)::integer from pg_temp.waiting('lily@example.com')), 1, 'one place for an address in an area');
select is((select full_name from pg_temp.waiting('lily@example.com')), 'Lily L', 'with what it said the second time');
select is(pg_temp.confirmations('lily@example.com'), 1, 'and one confirmation email a day for an address, whatever it asks for');

select pg_temp.visit_from('198.51.100.1');
select throws_ok(
  $$ select public.join_area_waiting_list('LS6 3QS', 'No Consent', 'none@example.com', '  ') $$,
  'P0001', 'CONSENT_REQUIRED', 'nothing is kept without consent'
);
select throws_ok(
  $$ select public.join_area_waiting_list('LS6 3QS', 'Bad Address', 'not-an-address', 'Yes') $$,
  'P0001', 'VALIDATION_FAILED', 'or for something that is not an email address'
);
select throws_ok($$ select * from public.area_waiting_list $$, '42501', null, 'and a visitor cannot read the list');

-- A learner who is signed in is linked to their place.
select tests.authenticate_as(:'learner');
select lives_ok(
  $$ select public.join_area_waiting_list('M1 1AE', 'Lee One', 'learner.1@test.local', 'Email me when I can book instructors near M.', 'manual') $$,
  'a signed-in learner joins the same way'
);
select throws_ok($$ select * from public.lesson_requests $$, '42501', null, 'and cannot read the lists either');
select tests.clear_authentication();
select is((select user_id from pg_temp.waiting('learner.1@test.local')), :'learner'::uuid, 'their place is linked to their account');

-- A lesson request.
select pg_temp.visit_from('198.51.100.2');
select is(
  public.post_lesson_request('LS6 3QS', 'Rob Request', 'rob@example.com', 'manual', 'some',
                             array[6, 1, 1]::smallint[], array['evening', 'morning'], 'this_month', 'Email me about my request.',
                             '+447700900123', 4000),
  '{"postcodeArea": "LS"}'::jsonb,
  'anybody may post a lesson request for an area that is not open'
);
select tests.clear_authentication();
select results_eq(
  $$ select transmission::text, experience, days, times, start_when, budget_pence, phone
       from public.lesson_requests where email = 'rob@example.com' $$,
  $$ values ('manual'::text, 'some'::text, array[1, 6]::smallint[], array['evening', 'morning']::text[], 'this_month'::text, 4000, '+447700900123'::text) $$,
  'what they need is kept, each day and time once'
);

select pg_temp.visit_from('198.51.100.2');
select throws_ok(
  $$ select public.post_lesson_request('LS6 3QS', 'Rob Request', 'rob2@example.com', 'manual', 'some',
                                       array[8]::smallint[], array['morning'], 'now', 'Yes') $$,
  'P0001', 'VALIDATION_FAILED', 'a day that is not one is refused'
);
select throws_ok(
  $$ select public.post_lesson_request('LS6 3QS', 'Rob Request', 'rob2@example.com', 'manual', 'lots',
                                       array[1]::smallint[], array['midnight'], 'now', 'Yes') $$,
  'P0001', 'VALIDATION_FAILED', 'as are a time of day and an experience that are not offered'
);

-- The link in the confirmation email.
select tests.clear_authentication();
select set_config('test.lily_token', (select token::text from pg_temp.waiting('lily@example.com')), true);
select pg_temp.visit_from('198.51.100.3');
select is(
  public.learner_capture_by_token(current_setting('test.lily_token')::uuid),
  '{"entries": [{"kind": "waiting_list", "postcodeArea": "LS", "active": true}, {"kind": "lesson_request", "postcodeArea": "LS", "active": true}]}'::jsonb,
  'a token shows what is kept for its address, by kind and area alone'
);
select is(public.leave_learner_capture(current_setting('test.lily_token')::uuid), 2, 'one step removes all of it');
select is(
  public.learner_capture_by_token(current_setting('test.lily_token')::uuid) -> 'entries',
  '[{"kind": "waiting_list", "postcodeArea": "LS", "active": false}, {"kind": "lesson_request", "postcodeArea": "LS", "active": false}]'::jsonb,
  'and then nothing stands'
);
select is(public.leave_learner_capture(current_setting('test.lily_token')::uuid), 0, 'so a second time changes nothing');
select is(public.learner_capture_by_token(gen_random_uuid()), null, 'and a token that is nobody''s says nothing');

-- Guarding it: ten a caller an hour, and nothing for an area already open.
select pg_temp.visit_from('198.51.100.4');
select lives_ok(
  $$ select public.join_area_waiting_list('LS6 3QS', 'Busy ' || n, 'busy' || n || '@example.com', 'Yes') from generate_series(1, 10) n $$,
  'a caller may keep ten in an hour'
);
select throws_ok(
  $$ select public.join_area_waiting_list('LS6 3QS', 'Busy 11', 'busy11@example.com', 'Yes') $$,
  'P0001', 'RATE_LIMITED', 'and no more'
);
select pg_temp.visit_from('198.51.100.5');
select lives_ok(
  $$ select public.join_area_waiting_list('LS6 3QS', 'Next Door', 'next.door@example.com', 'Yes') $$,
  'while another caller may still'
);

select tests.clear_authentication();
insert into public.marketplace_regions (postcode_area, marketplace_enabled, switched_at) values ('M', true, now());
select pg_temp.visit_from('198.51.100.6');
select throws_ok(
  $$ select public.join_area_waiting_list('M1 1AE', 'Too Late', 'late@example.com', 'Yes') $$,
  'P0001', 'MARKETPLACE_OPEN', 'nobody joins a waiting list for an area already open'
);

select tests.clear_authentication();
select is(
  (select count(*)::integer from information_schema.routine_privileges
    where routine_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
      and routine_name in ('system_learner_capture_confirmation', 'system_mark_learner_capture_confirmed')),
  0,
  'only the job reads who to email'
);

select * from finish();
rollback;
