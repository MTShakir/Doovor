-- Cities, their areas, and the place a postcode is in (PRD 8.3, M5-01).
begin;
select plan(16);

select results_eq(
  $$ select slug, name from public.cities order by slug $$,
  $$ values ('leeds', 'Leeds'), ('london', 'London'), ('manchester', 'Manchester') $$,
  'the three launch cities the plan names'
);

select results_eq(
  $$ select city_slug, count(*)::int, count(area_slug)::int from public.city_districts group by city_slug order by city_slug $$,
  $$ values ('leeds', 1, 0), ('london', 33, 33), ('manchester', 10, 9) $$,
  'Leeds is one district; London is its 33, each an area; Manchester is ten, the nine around the city each an area'
);

-- Every area's address is its name as the app would write it (packages/core/src/places.ts).
select is_empty(
  $$ select admin_district from public.city_districts where area_slug <> private.place_slug(area_name) $$,
  'every area address is made from its name'
);

-- Cached postcodes for the places below, written as the table's owner, as the cache would.
insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('LS1 4AP', 'LS1', 'LS', 53.7997, -1.5492, 'Leeds'),
       ('M1 1AE', 'M1', 'M', 53.4794, -2.2453, 'Manchester'),
       ('SK1 1EB', 'SK1', 'SK', 53.4106, -2.1575, 'Stockport'),
       ('SW1A 1AA', 'SW1A', 'SW', 51.5010, -0.1416, 'Westminster'),
       ('CR0 2RH', 'CR0', 'CR', 51.3762, -0.0982, 'Croydon'),
       ('BS1 5TR', 'BS1', 'BS', 51.4496, -2.5810, 'Bristol, City of'),
       ('EH1 1YZ', 'EH1', 'EH', 55.9496, -3.1914, 'City of Edinburgh'),
       ('ZE1 0AA', 'ZE1', 'ZE', 60.1530, -1.1493, null)
on conflict (postcode) do update set admin_district = excluded.admin_district;

select results_eq(
  $$ select city_slug, city_name, area_slug, area_name, has_hub from public.place_of_postcode('LS1 4AP') $$,
  $$ values ('leeds', 'Leeds', null::text, null::text, true) $$,
  'a Leeds postcode is in Leeds, whose page is the city page'
);
select results_eq(
  $$ select city_slug, area_slug, has_hub from public.place_of_postcode('M1 1AE') $$,
  $$ values ('manchester', null::text, true) $$,
  'a Manchester postcode is in Manchester'
);
select results_eq(
  $$ select city_slug, area_slug, area_name, has_hub from public.place_of_postcode('SK1 1EB') $$,
  $$ values ('manchester', 'stockport', 'Stockport', true) $$,
  'a Stockport postcode is in Manchester, in the Stockport area'
);
select results_eq(
  $$ select city_slug, area_slug, has_hub from public.place_of_postcode('SW1A 1AA') $$,
  $$ values ('london', 'westminster', true) $$,
  'a Westminster postcode is in London, in Westminster'
);
select results_eq(
  $$ select city_slug, city_name, area_slug, area_name from public.place_of_postcode('CR0 2RH') $$,
  $$ values ('london', 'London', 'croydon', 'Croydon') $$,
  'a Croydon postcode is in London, in Croydon, as /driving-lessons/london/croydon'
);
select results_eq(
  $$ select city_slug, city_name, area_slug, has_hub from public.place_of_postcode('BS1 5TR') $$,
  $$ values ('bristol', 'Bristol', null::text, false) $$,
  'a postcode outside the launch cities is a place of its own, named as people say it, with no city page'
);
select results_eq(
  $$ select city_slug, city_name from public.place_of_postcode('EH1 1YZ') $$,
  $$ values ('edinburgh', 'Edinburgh') $$,
  'and "City of Edinburgh" is Edinburgh'
);
select is_empty($$ select * from public.place_of_postcode('ZE1 0AA') $$, 'a postcode with no district is no place yet');
select is_empty($$ select * from public.place_of_postcode('LS99 9ZZ') $$, 'and one the cache has not seen is none');

-- The same names and answers as packages/core/src/places.test.ts.
select results_eq(
  $$ select private.place_name(d), private.place_slug(private.place_name(d))
       from unnest(array['Leeds', 'Bristol, City of', 'Kingston upon Hull, City of', 'Herefordshire, County of',
                         'City of Edinburgh', 'Glasgow City', 'King''s Lynn and West Norfolk', 'St. Helens',
                         'Stoke-on-Trent', 'Na h-Eileanan Siar', 'Armagh City, Banbridge and Craigavon',
                         'Derry City and Strabane', 'Ynys Môn']) with ordinality as t(d, n)
      order by n $$,
  $$ values ('Leeds', 'leeds'), ('Bristol', 'bristol'), ('Kingston upon Hull', 'kingston-upon-hull'),
            ('Herefordshire', 'herefordshire'), ('Edinburgh', 'edinburgh'), ('Glasgow', 'glasgow'),
            ('King''s Lynn and West Norfolk', 'kings-lynn-and-west-norfolk'), ('St. Helens', 'st-helens'),
            ('Stoke-on-Trent', 'stoke-on-trent'), ('Na h-Eileanan Siar', 'na-h-eileanan-siar'),
            ('Armagh City, Banbridge and Craigavon', 'armagh-city-banbridge-and-craigavon'),
            ('Derry City and Strabane', 'derry-city-and-strabane'), ('Ynys Môn', 'ynys-mon') $$,
  'the database names and addresses places as the app does'
);

set local role anon;
select results_eq(
  $$ select city_slug, area_slug from public.place_of_postcode('CR0 2RH') $$,
  $$ values ('london', 'croydon') $$,
  'anybody can find the place of a postcode, before signing in'
);
reset role;

select tests.create_fixture();
select tests.authenticate_as('b0000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ insert into public.cities (slug, name) values ('bristol', 'Bristol') $$,
  '42501', null,
  'nobody signed in can add a city'
);
select throws_ok(
  $$ update public.city_districts set city_slug = 'leeds' where admin_district = 'Croydon' $$,
  '42501', null,
  'or move a district to another city'
);
select tests.clear_authentication();

select * from finish();
