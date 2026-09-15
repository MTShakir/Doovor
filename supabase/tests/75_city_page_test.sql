-- City, area and transmission pages: who is listed where (PRD 8.3, M5-07).
--
-- The seed has instructors in Leeds and Manchester too, so every check here is about the fixture's
-- own instructors by their slugs, never a total.
begin;
select plan(14);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'

insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('LS1 4AP', 'LS1', 'LS', 53.7997, -1.5492, 'Leeds'),
       ('M1 1AE', 'M1', 'M', 53.47941, -2.24531, 'Manchester'),
       ('SK1 1EB', 'SK1', 'SK', 53.4106, -2.1575, 'Stockport')
on conflict (postcode) do update set admin_district = excluded.admin_district;

-- Asha teaches in Leeds, manual. Ian's base is in Stockport, automatic. Ivy's is central Manchester,
-- manual, and she has hidden her profile from search.
update public.instructor_profiles
   set public_slug = 'asha-one', verification_status = 'approved', badge_expiry = current_date + 200,
       base_postcode = 'LS1 4AP', transmission = 'manual'
 where id = :'asha';
update public.instructor_profiles
   set public_slug = 'ian-one', verification_status = 'approved', badge_expiry = current_date + 200,
       base_postcode = 'SK1 1EB', transmission = 'automatic', badge_number = '234567'
 where id = :'ian';
update public.instructor_profiles
   set public_slug = 'ivy-two', verification_status = 'approved', badge_expiry = current_date + 200,
       base_postcode = 'M1 1AE', transmission = 'manual', is_listed = false
 where id = :'ivy';

create or replace function pg_temp.slugs(p_page jsonb) returns text[] language sql as $$
  select coalesce(array_agg(x ->> 'slug' order by x ->> 'slug'), '{}')
    from jsonb_array_elements(p_page -> 'instructors') as x
   where x ->> 'slug' in ('asha-one', 'ian-one', 'ivy-two');
$$;

select tests.authenticate_as_anon();

select is(pg_temp.slugs(public.city_page('manchester')), array['ian-one'], 'Manchester lists its instructors in search: Ian, not Ivy, who is hidden, nor Asha, who is in Leeds');
select is(pg_temp.slugs(public.city_page('leeds')), array['asha-one'], 'and Leeds lists Asha');
select results_eq(
  $$ select p #>> '{city,name}', p #>> '{area,name}', pg_temp.slugs(p)
       from public.city_page('manchester', 'stockport') as p $$,
  $$ values ('Manchester', 'Stockport', array['ian-one']) $$,
  'the Stockport page lists the instructors whose base is in Stockport'
);
select ok(
  (select exists (select 1 from jsonb_array_elements(public.city_page('manchester') -> 'areas') as a
                   where a ->> 'slug' = 'stockport' and a ->> 'name' = 'Stockport' and (a ->> 'instructorCount')::int >= 1)),
  'the city page links to the areas that have somebody in them'
);
select is(pg_temp.slugs(public.city_page('manchester', null, 'automatic')), array['ian-one'], 'the automatic page lists those who teach automatic');

select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.city_page('manchester') #> '{instructors,0}') as k),
  array['areaName', 'car', 'hourlyFromPence', 'name', 'photoPath', 'qualification', 'slug', 'transmission'],
  'each instructor on it is these fields and no others'
);
select ok(
  (select public.city_page('manchester')::text not like '%SK1 1EB%'
      and public.city_page('manchester')::text not like '%234567%'),
  'no postcode or badge number anywhere in it'
);

select is(public.city_page('atlantis'), null, 'a city that is not a launch city has no page');
select is(public.city_page('manchester', 'croydon'), null, 'nor does an area of another city');
select is(public.city_page('manchester', 'nowhere-at-all'), null, 'or an area that does not exist');
select isnt(public.city_page('london'), null, 'a launch city with nobody in it yet still has its page');

-- Ivy shows herself in search again, and Ian's badge runs out.
select tests.clear_authentication();
update public.instructor_profiles set is_listed = true where id = :'ivy';
update public.instructor_profiles set badge_expiry = current_date - 1 where id = :'ian';
select tests.authenticate_as_anon();
select is(pg_temp.slugs(public.city_page('manchester')), array['ivy-two'], 'an expired badge leaves the city page, and a profile shown again joins it (acceptance test 10)');
select is(pg_temp.slugs(public.city_page('manchester', null, 'automatic')), '{}'::text[], 'and the automatic page, since Ivy teaches manual');
select ok(
  (select not exists (select 1 from jsonb_array_elements(public.city_page('manchester') -> 'areas') as a
                       where a ->> 'slug' = 'stockport' and (a ->> 'instructorCount')::int > 0
                         and not exists (select 1 from jsonb_array_elements(public.city_page('manchester', 'stockport') -> 'instructors')))),
  'an area counts only the instructors it lists'
);
select tests.clear_authentication();

select * from finish();
