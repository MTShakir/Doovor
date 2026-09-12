-- The learner card: one row, and only for the people allowed to see it (LRN-02, M2-05).
begin;
select plan(7);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'

-- Two hours taught, and one lesson still to come.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() - interval '8 days', now() - interval '8 days' + interval '90 minutes', 30, 'completed', 6200, 'instructor'),
       (:'school', :'ian', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() - interval '1 day', now() - interval '1 day' + interval '30 minutes', 30, 'completed', 2200, 'instructor');

-- The learner's own pickup point, and one the school keeps for them.
insert into public.pickup_points (learner_id, business_id, kind, label, address, is_default, created_by)
values (:'lee', null, 'home', 'Home', '1 Kirkstall Lane', true, :'lee'),
       (:'lee', :'school', 'custom', 'The college', 'Cookridge Street', false, :'ian_user');

select tests.authenticate_as(:'ian_user');

select is(
  (select count(*)::int from public.learner_card where learner_id = :'lee'),
  1,
  'a learner has one card in the Business that teaches them'
);
select is(
  (select minutes_taught from public.learner_card where learner_id = :'lee'),
  120,
  'the hours are the minutes of the lessons that happened'
);
select is(
  (select jsonb_array_length(pickup_points) from public.learner_card where learner_id = :'lee'),
  2,
  'their own pickup points and the ones this Business keeps are both on the card'
);
select is(
  (select pickup_points -> 0 ->> 'label' from public.learner_card where learner_id = :'lee'),
  'Home',
  'the one they are usually collected from is first'
);

-- The independent instructor down the road teaches the same learner, and knows nothing of
-- the school's lessons or its pickup points.
select tests.authenticate_as(:'asha_user');
select is(
  (select minutes_taught from public.learner_card where business_id = :'asha_biz'),
  0,
  'lessons taught by another Business are not on this Business card'
);
select is(
  (select jsonb_array_length(pickup_points) from public.learner_card where business_id = :'asha_biz'),
  1,
  'and neither are the pickup points that Business added'
);

select tests.authenticate_as(:'ivy_user');
select is(
  (select count(*)::int from public.learner_card where learner_id = :'lee'),
  0,
  'an instructor at the same school who does not teach them has no card to read'
);

select * from finish();
rollback;
