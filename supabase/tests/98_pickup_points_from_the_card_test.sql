-- An instructor keeps a learner's pickup points from the learner's card (COV-04, D-168): adds one,
-- makes it where lessons start, corrects it and removes it, while the learner's own stay theirs.
begin;
select plan(8);

select tests.create_fixture();

\set learner 'c0000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'

-- The learner's own, which is their default because it is their first.
select tests.authenticate_as(:'learner');
insert into public.pickup_points (learner_id, kind, label, address, postcode)
values (:'learner', 'home', 'Home', '12 Hyde Park Road, Leeds', 'LS6 1AB');

-- The instructor adds one, and makes it where lessons start, over the learner's own default.
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ insert into public.pickup_points (learner_id, business_id, kind, label, address, postcode, is_default, created_by)
            values (%L, %L, 'custom', 'Station', 'Leeds station', 'LS1 4DY', true, %L) $$,
         :'learner', :'asha_biz', :'asha_user'),
  'an instructor adds one and makes it where lessons start'
);
select tests.clear_authentication();
select is(
  (select string_agg(label, ',') from public.pickup_points where learner_id = :'learner' and is_default),
  'Station',
  'and it is the one default, the learner''s own no longer'
);

-- Corrects what the Business added.
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ update public.pickup_points set label = 'Train station' where learner_id = %L and label = 'Station' $$, :'learner'),
  'an instructor corrects one the Business added'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.pickup_points where learner_id = :'learner' and label = 'Train station'),
  1,
  'and it is corrected'
);

-- But the learner's own are theirs.
select tests.authenticate_as(:'asha_user');
update public.pickup_points set label = 'Changed' where learner_id = :'learner' and business_id is null;
select tests.clear_authentication();
select is(
  (select label from public.pickup_points where learner_id = :'learner' and business_id is null),
  'Home',
  'the learner''s own cannot be changed by the Business'
);

-- Making the learner's own the default again, from the card, is the learner's to do.
select tests.authenticate_as(:'learner');
update public.pickup_points set is_default = true where learner_id = :'learner' and label = 'Home';
select tests.clear_authentication();
select is(
  (select string_agg(label, ',') from public.pickup_points where learner_id = :'learner' and is_default),
  'Home',
  'and the learner can take the default back'
);

-- Removes what the Business added, and nothing of the learner's.
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ delete from public.pickup_points where learner_id = %L and label = 'Train station' $$, :'learner'),
  'an instructor removes one the Business added'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.pickup_points where learner_id = :'learner'),
  1,
  'and the learner''s own is still there'
);

select * from finish();
rollback;
