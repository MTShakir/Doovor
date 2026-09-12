-- Coverage is the circle, plus what was added, minus what was left out (COV-01, COV-02, M1-15).
begin;
select plan(12);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'

-- Leeds city centre, and two districts either side of an eight mile circle.
insert into public.postcodes (postcode, outcode, area, latitude, longitude) values
  ('LS1 4DY', 'LS1', 'LS', 53.7965, -1.5478),   -- in the middle
  ('LS17 8AB', 'LS17', 'LS', 53.8600, -1.5400), -- about 5 miles north
  ('YO1 7HH', 'YO1', 'YO', 53.9600, -1.0800)    -- York, well outside
on conflict (postcode) do nothing;

update public.instructor_profiles
   set base_location = extensions.st_setsrid(extensions.st_makepoint(-1.5478, 53.7965), 4326)::extensions.geography,
       base_postcode = 'LS1 4DY',
       radius_miles = 8
 where id = :'asha';

-- The circle on its own
select is(public.covers_postcode(:'asha', 'LS1 4DY'), true, 'the postcode at the middle is covered');
select is(public.covers_postcode(:'asha', 'ls17 8ab'), true, 'and one inside the circle, however it is typed');
select is(public.covers_postcode(:'asha', 'YO1 7HH'), false, 'a postcode well outside is not');
select is(public.covers_postcode(:'asha', 'LS99 9ZZ'), false, 'nor is one nobody has ever looked up');

-- Districts
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ insert into public.coverage_districts (instructor_id, business_id, outcode, rule)
            values (%L, %L, 'YO1', 'include') $$, :'asha', :'asha_biz'),
  'an instructor adds a district the circle misses'
);
select is(public.covers_postcode(:'asha', 'YO1 7HH'), true, 'and it is covered from then on');

select lives_ok(
  format($$ insert into public.coverage_districts (instructor_id, business_id, outcode, rule)
            values (%L, %L, 'LS1', 'exclude') $$, :'asha', :'asha_biz'),
  'and leaves out one inside the circle'
);
select is(public.covers_postcode(:'asha', 'LS1 4DY'), false, 'which then is not covered, circle or no circle');

select throws_ok(
  format($$ insert into public.coverage_districts (instructor_id, business_id, outcode, rule)
            values (%L, %L, 'Leeds', 'include') $$, :'asha', :'asha_biz'),
  '23514',
  null,
  'something that is not a district is refused'
);

-- Who may change them
select tests.authenticate_as(:'ivy_user');
with changed as (
  delete from public.coverage_districts where instructor_id = :'asha' returning 1
)
select is((select count(*)::int from changed), 0, 'one instructor cannot change the area of another');
select throws_ok(
  format($$ insert into public.coverage_districts (instructor_id, business_id, outcode, rule)
            values (%L, %L, 'LS6', 'include') $$, :'asha', :'asha_biz'),
  '42501',
  null,
  'nor add to it'
);

-- Anyone can read it: a learner asks "do you cover me?" before signing in.
select tests.authenticate_as_anon();
select is(
  (select count(*)::int from public.coverage_districts where instructor_id = :'asha'),
  2,
  'the public can read where an instructor teaches'
);

select * from finish();
rollback;
