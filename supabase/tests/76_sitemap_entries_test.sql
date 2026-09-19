-- Sitemaps: what search engines are told about (PRD 14.6, M5-08).
--
-- The seed has instructors in Leeds and Manchester too, so instructors and schools are checked by
-- the fixture's own slugs, and places by agreeing with the pages themselves, never by a total.
begin;
select plan(13);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'

insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('LS1 4AP', 'LS1', 'LS', 53.7997, -1.5492, 'Leeds'),
       ('M1 1AE', 'M1', 'M', 53.47941, -2.24531, 'Manchester'),
       ('SK1 1EB', 'SK1', 'SK', 53.4106, -2.1575, 'Stockport')
on conflict (postcode) do update set admin_district = excluded.admin_district;

-- Asha is independent in Leeds. Ian and Ivy teach at Bee School, whose base is central Manchester:
-- Ian from Stockport, automatic; Ivy from Manchester, with her profile hidden from search.
update public.businesses set base_postcode = 'M1 1AE' where id = :'school';
update public.instructor_profiles
   set public_slug = 'asha-one', verification_status = 'approved', badge_expiry = private.today() + 200,
       base_postcode = 'LS1 4AP', transmission = 'manual'
 where id = :'asha';
update public.instructor_profiles
   set public_slug = 'ian-one', verification_status = 'approved', badge_expiry = private.today() + 200,
       base_postcode = 'SK1 1EB', transmission = 'automatic', badge_number = '234567'
 where id = :'ian';
update public.instructor_profiles
   set public_slug = 'ivy-two', verification_status = 'approved', badge_expiry = private.today() + 200,
       base_postcode = 'M1 1AE', transmission = 'manual', is_listed = false
 where id = :'ivy';

create or replace function pg_temp.listed(p_type text, p_slugs text[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(x order by x ->> 'slug'), '[]'::jsonb)
    from jsonb_array_elements(public.sitemap_entries() -> p_type) as x
   where x ->> 'slug' = any (p_slugs);
$$;

-- How many a place's entry says it lists, and how many its page does.
create or replace function pg_temp.counts(p_city text, p_area text, p_automatic boolean) returns table (said int, shown int) language sql as $$
  select (select (x ->> 'instructorCount')::int
            from jsonb_array_elements(public.sitemap_entries() -> 'places') as x
           where x ->> 'citySlug' = p_city
             and x ->> 'areaSlug' is not distinct from p_area
             and (x ->> 'automatic')::boolean = p_automatic),
         jsonb_array_length(public.city_page(p_city, p_area, case when p_automatic then 'automatic' end) -> 'instructors');
$$;

select tests.authenticate_as_anon();

select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.sitemap_entries()) as k),
  array['instructors', 'places', 'schools'],
  'the sitemaps have three kinds of entry from the database, and no others'
);
select is(
  pg_temp.listed('instructors', array['asha-one', 'ian-one', 'ivy-two']),
  '[{"slug": "asha-one", "citySlug": "leeds"}, {"slug": "ian-one", "citySlug": "manchester"}]'::jsonb,
  'instructors search may show, each under the city in their address: not Ivy, who is hidden'
);
select is(
  pg_temp.listed('schools', array['asha-driving', 'bee-school']),
  '[{"slug": "bee-school", "citySlug": "manchester"}]'::jsonb,
  'a school with an instructor in search, under its own city, and no Business of one'
);
select results_eq(
  $$ select said, shown from pg_temp.counts('manchester', null, false) $$,
  $$ select shown, shown from pg_temp.counts('manchester', null, false) $$,
  'a city says how many its page lists'
);
select results_eq(
  $$ select said, shown from pg_temp.counts('manchester', 'stockport', false) $$,
  $$ values (1, 1) $$,
  'as does an area with somebody in it'
);
select results_eq(
  $$ select said, shown from pg_temp.counts('manchester', null, true) $$,
  $$ select shown, shown from pg_temp.counts('manchester', null, true) $$,
  'and an automatic page'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.sitemap_entries() #> '{places,0}') as k),
  array['areaSlug', 'automatic', 'citySlug', 'instructorCount'],
  'each place is these fields and no others'
);
select ok(
  (select bool_and((x ->> 'instructorCount')::int >= 1) from jsonb_array_elements(public.sitemap_entries() -> 'places') as x),
  'no place is there with nobody listed in it'
);
select ok(
  public.sitemap_entries()::text not like '%SK1 1EB%' and public.sitemap_entries()::text not like '%234567%',
  'no postcode or badge number anywhere in it'
);

-- Ian's badge runs out, and Bee School has nobody left in search.
select tests.clear_authentication();
update public.instructor_profiles set badge_expiry = private.today() - 1 where id = :'ian';
select tests.authenticate_as_anon();

select is(pg_temp.listed('instructors', array['ian-one']), '[]'::jsonb, 'an instructor whose badge has run out leaves the sitemap');
select is(pg_temp.listed('schools', array['bee-school']), '[]'::jsonb, 'and so does a school with nobody left in search');
select is(
  (select count(*)::int from jsonb_array_elements(public.sitemap_entries() -> 'places') as x
    where x ->> 'citySlug' = 'manchester' and x ->> 'areaSlug' = 'stockport'),
  0,
  'and an area with nobody left in it'
);

-- Suspended, Asha's Business takes her out too.
select tests.clear_authentication();
update public.businesses set status = 'suspended' where id = 'aaaa0000-0000-0000-0000-000000000000';
select tests.authenticate_as_anon();
select is(pg_temp.listed('instructors', array['asha-one']), '[]'::jsonb, 'as does an instructor at a suspended Business');
select tests.clear_authentication();

select * from finish();
