-- A learner has a few places a lesson can start, and exactly one of them is the default
-- (COV-04, M1-16).
begin;
select plan(10);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'
\set other_learner 'c0000000-0000-0000-0000-000000000002'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'

-- The learner adds their own.
select tests.authenticate_as(:'learner');
select lives_ok(
  $$ insert into public.pickup_points (learner_id, kind, label, address, postcode)
     values ('c0000000-0000-0000-0000-000000000001', 'home', 'Home', '12 Hyde Park Road, Leeds', 'LS6 1AB') $$,
  'a learner adds where they live'
);
select is(
  (select count(*)::int from public.pickup_points where learner_id = :'learner' and is_default),
  1,
  'the first one is the default, without anyone saying so'
);

select lives_ok(
  $$ insert into public.pickup_points (learner_id, kind, label, address, postcode)
     values ('c0000000-0000-0000-0000-000000000001', 'work', 'Work', '1 Wellington Place, Leeds', 'LS1 4AP') $$,
  'and another where they work'
);
select is(
  (select label from public.pickup_points where learner_id = :'learner' and is_default),
  'Home',
  'which does not become the default on its own'
);

-- Changing the default moves it, rather than making a second one.
update public.pickup_points set is_default = true
 where learner_id = :'learner' and label = 'Work';
select is(
  (select count(*)::int from public.pickup_points where learner_id = :'learner' and is_default),
  1,
  'setting a new default takes it off the old one'
);
select is(
  (select label from public.pickup_points where learner_id = :'learner' and is_default),
  'Work',
  'and it is the one that was chosen'
);

-- The Business can add one for a learner it works with.
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ insert into public.pickup_points (learner_id, business_id, kind, label, address, postcode, created_by)
            values (%L, %L, 'school', 'College', 'Leeds City College', 'LS2 7EA', %L) $$,
         :'learner', :'asha_biz', :'asha_user'),
  'an instructor adds one for a learner they teach'
);

-- And not for someone else's learner.
select throws_ok(
  format($$ insert into public.pickup_points (learner_id, business_id, kind, label, address, postcode, created_by)
            values (%L, %L, 'home', 'Home', 'Somewhere', 'LS1 4DY', %L) $$,
         :'other_learner', :'asha_biz', :'asha_user'),
  '42501',
  null,
  'but not for a learner they have nothing to do with'
);

-- A learner cannot see another learner's addresses.
select tests.authenticate_as(:'other_learner');
select is(
  (select count(*)::int from public.pickup_points where learner_id = :'learner'),
  0,
  'one learner cannot see where another is picked up'
);

-- Two learners each have their own default.
select tests.authenticate_as(:'other_learner');
select lives_ok(
  $$ insert into public.pickup_points (learner_id, kind, label, address, postcode)
     values ('c0000000-0000-0000-0000-000000000002', 'home', 'Home', '5 Otley Road, Leeds', 'LS6 4JD') $$,
  'the rule is per learner, not across everyone'
);

select * from finish();
rollback;
