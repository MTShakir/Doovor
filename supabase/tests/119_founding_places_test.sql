-- How many founding places have gone, as the public site says it (D-203, D-243).
--
-- The number is a public claim about scarcity, so what is tested is that it is the database's own
-- count and nothing else: it moves when a place is given, it follows the setting, and anybody can
-- read it without being able to read anything about whose places they are.
begin;
select plan(8);

-- What is there before this test adds anything, so the assertions are about the change rather
-- than about whatever the seed and earlier runs left.
select (public.founding_places() ->> 'instructorsJoined')::int as before_instructors \gset
select (public.founding_places() ->> 'schoolsJoined')::int as before_schools \gset

select is(
  (public.founding_places() ->> 'instructorLimit')::int,
  (select (value ->> 'instructor_limit')::int from public.platform_settings where key = 'founding_offer'),
  'the limit is the setting''s, not a number of its own'
);
select is(
  (public.founding_places() ->> 'months')::int,
  12,
  'and so is how long it lasts'
);

-- A place given is a place counted.
insert into public.businesses (type, name, slug, plan, founding_offer)
values ('independent', 'Counted Driving', 'counted-driving-' || substr(md5(random()::text), 1, 8), 'pro', true);
select is(
  (public.founding_places() ->> 'instructorsJoined')::int,
  :before_instructors + 1,
  'an instructor given a place is counted at once'
);
select is(
  (public.founding_places() ->> 'schoolsJoined')::int,
  :before_schools,
  'and not as a school'
);

-- A Business without a place, which is everybody after the hundred, is not counted.
insert into public.businesses (type, name, slug, plan, founding_offer)
values ('independent', 'Not Counted Driving', 'not-counted-' || substr(md5(random()::text), 1, 8), 'free', false);
select is(
  (public.founding_places() ->> 'instructorsJoined')::int,
  :before_instructors + 1,
  'somebody who did not get a place does not make the number bigger'
);

-- The limit is a setting a super admin can move, and the count says so the moment it moves.
update public.platform_settings
   set value = jsonb_set(value, '{instructor_limit}', '120'::jsonb)
 where key = 'founding_offer';
select is((public.founding_places() ->> 'instructorLimit')::int, 120, 'a new limit is read straight away');

-- Anybody may read it: the page is public. It carries a count and nothing about who.
set local role anon;
select is(
  (select count(*)::int from jsonb_object_keys(public.founding_places())),
  5,
  'somebody who is not signed in can read the count, and it is five numbers and nothing else'
);
select throws_ok(
  $$ select count(*) from public.businesses $$,
  '42501',
  null,
  'without being able to read the Businesses it counts'
);
reset role;

select * from finish();
rollback;
