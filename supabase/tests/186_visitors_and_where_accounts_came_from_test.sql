-- Visits to the public site, counted without cookies, and where each account came from (D-413).
--
-- The report is held in March 2021, long before anything else, so the only visits and sign-ups in
-- its range are the ones made here.
begin;
select plan(48);

\set staff 'e0000000-0000-0000-0000-000000000010'

select tests.create_user_with_id(:'staff', 'support@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');
select tests.create_user('lena@test.local', 'Lena Learner') as lena \gset

-- ---------------------------------------------------------------------------------------
-- Writing a visit: the server alone.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.system_record_visit('/', true, null, 'direct', 'direct', null, null, null, null, null, null, 'phone', 'Safari', 'iOS', null) $$,
  '42501', null, 'a stranger cannot write a visit'
);
select tests.authenticate_as(:'lena');
select throws_ok(
  $$ select public.system_record_visit('/', true, null, 'direct', 'direct', null, null, null, null, null, null, 'phone', 'Safari', 'iOS', null) $$,
  '42501', null, 'somebody signed in cannot write one either'
);
select tests.clear_authentication();

set local role service_role;
select ok(
  public.system_record_visit('/join', true, '/somewhere-else', 'print', 'card', null, 'week1', null, 'GB', 'ENG', 'Belvedere', 'phone', 'Safari', 'iOS', null),
  'the server writes a visit'
);
select ok(
  public.system_record_visit('/pricing', false, '/join', 'print', 'card', '', 'week1', '', '', '', '', 'phone', 'Safari', 'iOS', ''),
  'and the page after it, with its empty words as nothing'
);
reset role;

select results_eq(
  $$ select path, entry, landing, occurred_at = date_trunc('hour', now()), medium is null, country, city
       from public.site_visits where source = 'card' order by entry desc $$,
  $$ values ('/join'::text, true, '/join'::text, true, true, 'GB'::text, 'Belvedere'::text),
            ('/pricing'::text, false, '/join'::text, true, true, null::text, null::text) $$,
  'kept to the hour, with the first page as where the visit landed, and nothing for what was empty'
);

set local role service_role;
select throws_ok(
  $$ select public.system_record_visit('/', true, null, 'direct', 'Not A Source!', null, null, null, null, null, null, 'phone', 'Safari', 'iOS', null) $$,
  '23514', null, 'a source that is not a plain word is refused'
);
select throws_ok(
  $$ select public.system_record_visit('/pricing?email=someone@example.com', true, null, 'direct', 'direct', null, null, null, null, null, null, 'phone', 'Safari', 'iOS', null) $$,
  '23514', null, 'a page carries no query, so nothing typed into an address is kept'
);
select throws_ok(
  $$ select public.system_record_visit('/', true, null, 'direct', 'direct', null, null, null, null, null, null, 'smartwatch', 'Safari', 'iOS', null) $$,
  '23514', null, 'a device is a phone, a tablet or a computer'
);
reset role;

-- Far more in an hour than people make is ignored until the hour turns.
insert into public.site_visits (path, entry, landing, channel, source, device, browser, system)
select '/', true, '/', 'direct', 'direct', 'computer', 'Chrome', 'Windows' from generate_series(1, 10000);
set local role service_role;
select is(
  public.system_record_visit('/', true, null, 'direct', 'direct', null, null, null, null, null, null, 'phone', 'Safari', 'iOS', null),
  false,
  'a flood is not written'
);
reset role;
delete from public.site_visits;

-- ---------------------------------------------------------------------------------------
-- Reading them: platform staff past their second step, and nobody else.
-- ---------------------------------------------------------------------------------------
-- A week in March 2021: three visits from Instagram on Monday, two of them on to pricing; a card
-- scanned on Wednesday; a Google search on Friday from a town nobody knows; and two visits the
-- week before, one of them from Instagram.
insert into public.site_visits (occurred_at, path, entry, landing, channel, source, medium, campaign, referrer, country, region, city, device, browser, system, app) values
  ('2021-03-01T09:00:00Z', '/instructors-software', true, '/instructors-software', 'social', 'instagram', null, 'week1', 'l.instagram.com', 'GB', 'ENG', 'London', 'phone', 'Instagram app', 'iOS', 'instagram'),
  ('2021-03-01T09:00:00Z', '/pricing', false, '/instructors-software', 'social', 'instagram', null, 'week1', 'l.instagram.com', 'GB', 'ENG', 'London', 'phone', 'Instagram app', 'iOS', 'instagram'),
  ('2021-03-01T12:00:00Z', '/', true, '/', 'social', 'instagram', null, 'week1', null, 'GB', 'ENG', 'Leeds', 'phone', 'Instagram app', 'Android', 'instagram'),
  ('2021-03-01T12:00:00Z', '/pricing', false, '/', 'social', 'instagram', null, 'week1', null, 'GB', 'ENG', 'Leeds', 'phone', 'Instagram app', 'Android', 'instagram'),
  ('2021-03-01T20:00:00Z', '/learners', true, '/learners', 'social', 'instagram', null, 'week2', null, 'GB', 'ENG', 'London', 'tablet', 'Safari', 'iOS', null),
  ('2021-03-03T10:00:00Z', '/join', true, '/join', 'print', 'card', null, null, null, 'GB', 'ENG', 'Belvedere', 'phone', 'Chrome', 'Android', null),
  ('2021-03-05T15:00:00Z', '/guides/driving-instructor-expenses', true, '/guides/driving-instructor-expenses', 'search', 'google', null, null, 'google.co.uk', null, null, null, 'computer', 'Edge', 'Windows', null),
  ('2021-02-24T09:00:00Z', '/', true, '/', 'social', 'instagram', null, null, null, 'GB', 'ENG', 'London', 'phone', 'Safari', 'iOS', null),
  ('2021-02-25T09:00:00Z', '/', true, '/', 'direct', 'direct', null, null, null, 'GB', 'ENG', 'London', 'computer', 'Chrome', 'Windows', null);

select tests.authenticate_as(:'lena', 'aal2');
select is_empty($$ select 1 from public.site_visits $$, 'a learner reads no visits');
select throws_ok(
  $$ select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') $$,
  '42501', null, 'nor the report'
);
select tests.authenticate_as(:'staff', 'aal1');
select throws_ok(
  $$ select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') $$,
  '42501', null, 'staff need their second step for it'
);

select tests.authenticate_as(:'staff', 'aal2');
select is(
  (select count(*)::integer from public.site_visits),
  9,
  'staff read the visits themselves'
);
select throws_ok(
  $$ select public.site_visits_report('2021-03-08T00:00:00Z', '2021-03-01T00:00:00Z', '{}') $$,
  'VALIDATION_FAILED', 'a range runs forwards'
);
select throws_ok(
  $$ select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '[]') $$,
  'VALIDATION_FAILED', 'filters are a list of names and values'
);

select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') -> 'totals'),
  '{"visits": 5, "page_views": 7}'::jsonb,
  'a visit is the first page of one, and every page opened is a page view'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') -> 'before'),
  '{"visits": 2, "page_views": 2}'::jsonb,
  'and the week before, to compare'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{breakdowns,source}'),
  '[{"key": "instagram", "visits": 3, "page_views": 5}, {"key": "card", "visits": 1, "page_views": 1}, {"key": "google", "visits": 1, "page_views": 1}]'::jsonb,
  'where they came from, most visits first'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{breakdowns,page,0}'),
  '{"key": "/pricing", "visits": 0, "page_views": 2}'::jsonb,
  'the pages read are put in order of how often each was opened'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{breakdowns,landing}') -> 0 ->> 'visits',
  '1',
  'landing pages count the visits that began on each'
);
select is(
  (select jsonb_array_length(public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') -> 'series')),
  7,
  'a week is seven days, the empty ones too'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{series,0}'),
  '{"at": "2021-03-01", "visits": 3, "page_views": 5, "channels": {"social": 3}}'::jsonb,
  'each day says its visits, page views and visits by group'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{series,1}'),
  '{"at": "2021-03-02", "visits": 0, "page_views": 0, "channels": {}}'::jsonb,
  'a day with nothing says nothing'
);

-- Filters.
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"source": "instagram", "campaign": "week1"}') -> 'totals'),
  '{"visits": 2, "page_views": 4}'::jsonb,
  'filters narrow the visits, and more than one narrows them more'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"device": "phone", "city": "London"}') -> 'totals'),
  '{"visits": 1, "page_views": 2}'::jsonb,
  'a device and a town together'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"country": ""}') -> 'totals'),
  '{"visits": 1, "page_views": 1}'::jsonb,
  'an empty value asks for the visits where it is not known'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"landing": "/instructors-software"}') -> 'totals'),
  '{"visits": 1, "page_views": 2}'::jsonb,
  'a landing page keeps every page of the visits that began on it'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"page": "/pricing"}') -> 'totals'),
  '{"visits": 0, "page_views": 2}'::jsonb,
  'a page keeps the times it was opened'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"app": "instagram"}') #> '{breakdowns,city}'),
  '[{"key": "Leeds", "visits": 1, "page_views": 2}, {"key": "London", "visits": 1, "page_views": 2}]'::jsonb,
  'opened inside an app, and where'
);

-- A day is drawn hour by hour.
select is(
  (select jsonb_array_length(public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-02T00:00:00Z', '{}') -> 'series')),
  24,
  'a day is twenty four hours'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-02T00:00:00Z', '{}') #> '{series,9}'),
  '{"at": "2021-03-01T09:00:00Z", "visits": 1, "page_views": 2, "channels": {"social": 1}}'::jsonb,
  'each hour keyed by the hour itself'
);

-- The rows, for a spreadsheet.
select is(
  (select count(*)::integer from public.site_visits_rows('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"source": "instagram"}')),
  5,
  'staff download the rows the screen shows'
);
select tests.authenticate_as(:'lena', 'aal2');
select throws_ok(
  $$ select * from public.site_visits_rows('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') $$,
  '42501', null, 'and nobody else does'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- Where an account came from.
-- ---------------------------------------------------------------------------------------
select tests.create_user('ian@test.local', 'Ian Instructor', '{"intended_role": "instructor", "arrival_source": "card", "arrival_campaign": "week1", "arrival_channel": "print", "heard_about": "print"}') as ian \gset
select tests.create_user('sal@test.local', 'Sal School', '{"intended_role": "school", "heard_about": "other", "heard_about_other": "  A stand at the ADI conference  "}') as sal \gset
select tests.create_user('leo@test.local', 'Leo Learner', '{"intended_role": "learner", "arrival_source": "<b>", "heard_about": "carrier-pigeon", "heard_about_other": "kept?"}') as leo \gset
select tests.create_user('ida@test.local', 'Ida Instructor', '{"intended_role": "instructor", "arrival_source": "instagram", "arrival_medium": "social", "arrival_channel": "made-up"}') as ida \gset

select results_eq(
  $$ select o.source, o.medium, o.campaign, o.channel, o.heard_about, o.heard_about_other
       from public.account_origins o join public.users u on u.id = o.user_id
      where u.email in ('ian@test.local', 'sal@test.local', 'ida@test.local')
      order by u.email $$,
  $$ values ('card'::text, null::text, 'week1'::text, 'print'::text, 'print'::text, null::text),
            ('instagram'::text, 'social'::text, null::text, 'other'::text, null::text, null::text),
            (null::text, null::text, null::text, null::text, 'other'::text, 'A stand at the ADI conference'::text) $$,
  'a sign-up keeps the link it came on and its answer, an answer in their own words trimmed, and a group it cannot read as other'
);
select is_empty(
  $$ select 1 from public.account_origins o join public.users u on u.id = o.user_id where u.email = 'leo@test.local' $$,
  'nothing it cannot read is kept, and nothing is not a row'
);

-- Somebody who came with Google says it on the screen after.
select tests.create_user('gia@test.local', 'Gia Google') as gia \gset
select tests.authenticate_as(:'gia');
select is(
  public.record_account_origin('google', 'search', null, 'search', 'search', null),
  true,
  'a new account records where it came from'
);
select is(
  public.record_account_origin('instagram', null, null, 'social', 'instagram', null),
  false,
  'once: the first answer is the one that counts'
);
select throws_ok(
  $$ select public.record_account_origin('google', null, null, 'search', 'carrier-pigeon', null) $$,
  'VALIDATION_FAILED', 'an answer is one of the choices'
);
select results_eq(
  $$ select source, channel, heard_about from public.account_origins $$,
  $$ values ('google'::text, 'search'::text, 'search'::text) $$,
  'somebody reads their own origin, and nobody else''s'
);
select ok(
  (select public.export_my_data() #>> '{how_you_found_us,link_source}') = 'google'
    and (select public.export_my_data() #>> '{how_you_found_us,answer}') = 'search'
    and (select public.export_my_data() -> 'account' ->> 'full_name') = 'Gia Google',
  'and downloads it with the rest of what we hold'
);
select tests.clear_authentication();

update public.users set created_at = now() - interval '2 days' where id = :'lena';
select tests.authenticate_as(:'lena');
select is(
  public.record_account_origin('google', null, null, 'search', null, null),
  false,
  'an account that is not new has no origin to record'
);
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.record_account_origin('google', null, null, 'search', null, null) $$,
  '42501', null, 'and nobody signed out records one'
);
select tests.clear_authentication();

-- Sign-ups in the report: Ian, Sal and Ida confirmed in March 2021, Leo never confirmed.
update public.users set created_at = '2021-03-02T10:00:00Z' where email in ('ian@test.local', 'sal@test.local', 'ida@test.local', 'leo@test.local');
update public.users set email_verified_at = null where email = 'leo@test.local';
select tests.authenticate_as(:'staff', 'aal2');
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{signups,totals}'),
  '{"learners": 0, "instructors": 2, "schools": 1, "undecided": 0}'::jsonb,
  'sign-ups are counted as the dashboard counts them'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{signups,by_source}'),
  '[{"key": "card", "channel": "print", "learners": 0, "instructors": 1, "schools": 0, "undecided": 0},
    {"key": "instagram", "channel": "other", "learners": 0, "instructors": 1, "schools": 0, "undecided": 0},
    {"key": null, "channel": null, "learners": 0, "instructors": 0, "schools": 1, "undecided": 0}]'::jsonb,
  'by the link each came on'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{"source": "card", "device": "computer"}') #> '{signups,totals}'),
  '{"learners": 0, "instructors": 1, "schools": 0, "undecided": 0}'::jsonb,
  'a source narrows the sign-ups, and a device, which an account has no answer for, does not'
);
select is(
  (select public.site_visits_report('2021-03-01T00:00:00Z', '2021-03-08T00:00:00Z', '{}') #> '{signups,in_their_words,0,text}'),
  '"A stand at the ADI conference"'::jsonb,
  'and what people wrote in their own words'
);
select tests.clear_authentication();

-- Deleting an account takes its origin with it.
update public.users set deleted_at = now() where email = 'sal@test.local';
select is_empty(
  $$ select 1 from public.account_origins o join public.users u on u.id = o.user_id where u.email = 'sal@test.local' $$,
  'a deleted account keeps no origin'
);

-- Two years are kept.
delete from public.site_visits;
insert into public.site_visits (occurred_at, path, entry, landing, channel, source, device, browser, system)
values (date_trunc('hour', now() - interval '2 years 1 day'), '/', true, '/', 'direct', 'direct', 'phone', 'Safari', 'iOS');
set local role service_role;
select is(public.system_prune_site_visits(), 1, 'visits older than two years go each night');
reset role;

select * from finish();
rollback;
