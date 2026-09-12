-- The postcode cache is public to read and only ever added to (COV-03, M1-05).
begin;
select plan(9);

select tests.create_user('geo@test.local', 'Gina Geo') as user \gset

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'postcodes'),
  'the postcode cache has row-level security'
);

-- Anyone may read it: a learner searches before they have an account.
select tests.clear_authentication();
insert into public.postcodes (postcode, outcode, area, latitude, longitude)
values ('LS1 4DY', 'LS1', 'LS', 53.7965, -1.5478);

select tests.authenticate_as_anon();
select is(
  (select outcode from public.postcodes where postcode = 'LS1 4DY'),
  'LS1',
  'a visitor who is not signed in can read the cache'
);
select throws_ok(
  $$ insert into public.postcodes (postcode, outcode, area, latitude, longitude)
     values ('LS2 8AA', 'LS2', 'LS', 53.80, -1.55) $$,
  '42501',
  null,
  'and cannot write to it'
);

select tests.authenticate_as(:'user');
select throws_ok(
  $$ insert into public.postcodes (postcode, outcode, area, latitude, longitude)
     values ('LS2 8AA', 'LS2', 'LS', 53.80, -1.55) $$,
  '42501',
  null,
  'nor can someone signed in: the cache is written through the function'
);

-- The function
select lives_ok(
  $$ select public.cache_postcode('LS6 3HN', 'LS6', 53.815, -1.566, 'Leeds', 'England') $$,
  'a lookup the app made is recorded'
);
select is(
  (select area from public.postcodes where postcode = 'LS6 3HN'),
  'LS',
  'the postal area is worked out rather than trusted'
);
select ok(
  (select location is not null from public.postcodes where postcode = 'LS6 3HN'),
  'and the point is ready for distance searches'
);

-- A row is never changed, so nobody can move a postcode somebody else covers.
select lives_ok(
  $$ select public.cache_postcode('LS6 3HN', 'LS6', 51.5, 0.1, 'London', 'England') $$,
  'sending different coordinates for a postcode already known does not fail'
);
select is(
  (select latitude from public.postcodes where postcode = 'LS6 3HN'),
  53.815::double precision,
  'but it changes nothing'
);

select * from finish();
rollback;
