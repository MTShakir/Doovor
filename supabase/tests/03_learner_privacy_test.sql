-- Learner privacy (LRN-04, R-16, NFR-PRV-04, D-019) and cross-tenant isolation of
-- learner data (NFR-SEC-01, acceptance test 7 at database level).
begin;
select plan(28);

select tests.create_fixture();

insert into public.learner_notes (business_id, learner_id, author_id, body) values
  ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'Nervous at roundabouts'),
  ('aaaa0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Needs mirror checks'),
  ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000004', 'Great progress');

-- ---------------------------------------------------------------------------------------
-- Learner 1 (linked to both businesses)
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');

select is_empty($$ select id from public.learner_notes $$, 'learners never see notes about themselves (LRN-04)');
select throws_ok(
  $$ insert into public.learner_notes (business_id, learner_id, author_id, body)
     values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'learners cannot write notes'
);
select results_eq(
  $$ select date_of_birth from public.learner_private $$,
  $$ values ('2000-05-01'::date) $$,
  'learners see their own date of birth'
);
select results_eq(
  $$ select display_name from public.instructor_profiles order by display_name $$,
  $$ values ('Asha'), ('Ian'), ('Ivy') $$,
  'a learner sees the instructors of businesses they are linked to'
);
select results_eq(
  $$ select name from public.businesses order by name $$,
  $$ values ('Asha Driving'), ('Bee School') $$,
  'a learner sees the businesses they are linked to'
);
select is_empty(
  $$ select id from public.learner_relationships where learner_id <> 'c0000000-0000-0000-0000-000000000001' $$,
  'a learner sees only their own relationships'
);

-- ---------------------------------------------------------------------------------------
-- Learner 3 (not linked)
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as('c0000000-0000-0000-0000-000000000003');
select is_empty($$ select id from public.instructor_profiles $$, 'an unlinked learner sees no instructor profiles');

-- ---------------------------------------------------------------------------------------
-- Instructor B1 (teaches learner 1 at Bee School)
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');

select results_eq(
  $$ select body from public.learner_notes $$,
  $$ values ('Nervous at roundabouts') $$,
  'an instructor sees notes on their own learners in their own business only'
);
select is_empty($$ select user_id from public.learner_private $$, 'instructors never see dates of birth (R-16)');
select is(private.learner_age_band('c0000000-0000-0000-0000-000000000001'), '18_plus', 'instructors see an age band instead');
select is(private.learner_age_band('c0000000-0000-0000-0000-000000000002'), null, 'no age band for learners they do not teach');
select results_eq(
  $$ select full_name from public.users where id::text like 'c0000000%' $$,
  $$ values ('Lee One') $$,
  'an instructor sees their own learners and nobody else'
);
select lives_ok(
  $$ insert into public.learner_notes (business_id, learner_id, author_id, body)
     values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003', 'Try the ring road next') $$,
  'an assigned instructor can add a note'
);
select throws_ok(
  $$ insert into public.learner_notes (business_id, learner_id, author_id, body)
     values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003', 'Not my learner') $$,
  '42501', null, 'an instructor cannot add notes for learners they do not teach'
);

-- ---------------------------------------------------------------------------------------
-- Manager B
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as('b0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.learner_notes), 3, 'a manager sees every note in their school and none elsewhere');
select is(private.learner_age_band('c0000000-0000-0000-0000-000000000002'), 'under_18', 'a 17 year old shows as under 18');
select is_empty($$ select user_id from public.learner_private $$, 'managers never see dates of birth either');

-- ---------------------------------------------------------------------------------------
-- Owner of Business A asks for Business B's data by id (acceptance test 7)
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as('a0000000-0000-0000-0000-000000000001');
select is_empty(
  $$ select id from public.users where id = 'c0000000-0000-0000-0000-000000000002' $$,
  'Business A cannot read Business B''s learner by id (acceptance test 7)'
);
select is_empty(
  $$ select id from public.learner_relationships where business_id = 'bbbb0000-0000-0000-0000-000000000000' $$,
  'Business A cannot read Business B''s learner relationships'
);
select is_empty(
  $$ select id from public.learner_notes where business_id = 'bbbb0000-0000-0000-0000-000000000000' $$,
  'Business A cannot read Business B''s notes'
);

-- ---------------------------------------------------------------------------------------
-- Outsider
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as('d0000000-0000-0000-0000-000000000001');
select is_empty($$ select user_id from public.learner_profiles $$, 'outsiders see no learner profiles');
select is((select count(*)::int from public.users), 1, 'outsiders see only themselves');

-- ---------------------------------------------------------------------------------------
-- Pickup points (COV-04)
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select lives_ok(
  $$ insert into public.pickup_points (learner_id, kind, label, address)
     values ('c0000000-0000-0000-0000-000000000001', 'home', 'Home', '12 Cardigan Road') $$,
  'a learner adds their own pickup point'
);
select throws_ok(
  $$ insert into public.pickup_points (learner_id, business_id, kind, label, address)
     values ('c0000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000000', 'work', 'Work', 'Office') $$,
  '42501', null, 'a learner cannot create points on behalf of a business'
);

select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
select lives_ok(
  $$ insert into public.pickup_points (learner_id, business_id, kind, label, address, created_by)
     values ('c0000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000000', 'school', 'College', 'Park Lane College',
             'b0000000-0000-0000-0000-000000000003') $$,
  'an instructor adds a pickup point for their learner'
);

select tests.authenticate_as('a0000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select label from public.pickup_points $$,
  $$ values ('Home') $$,
  'another business sees the learner''s own point but not points Bee School added'
);

select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.pickup_points), 2, 'the learner sees every point about them');

select tests.authenticate_as_anon();
select throws_ok($$ select count(*) from public.instructor_profiles $$, '42501', null, 'anonymous visitors cannot read instructor profiles');

select * from finish();
rollback;
