-- A trainee nobody supervises is out of search, as somebody whose badge has run out is
-- (INS-04, R-18, INS-03, D-347).
begin;
select plan(6);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- Ian is a trainee at the school, checked and listed, based in Stockport.
insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('SK1 1EB', 'SK1', 'SK', 53.4106, -2.1575, 'Stockport')
on conflict (postcode) do update set admin_district = excluded.admin_district;
update public.instructor_profiles
   set public_slug = 'ian-trainee', verification_status = 'approved', badge_expiry = private.today() + 200,
       base_postcode = 'SK1 1EB', transmission = 'automatic', qualification = 'pdi', is_listed = true
 where id = :'ian';

create or replace function pg_temp.on_city_page() returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.city_page('manchester') -> 'instructors') as x
                  where x ->> 'slug' = 'ian-trainee');
$$;
create or replace function pg_temp.in_sitemap() returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.sitemap_entries() -> 'instructors') as x
                  where x ->> 'slug' = 'ian-trainee');
$$;

select tests.authenticate_as_anon();
select is((public.instructor_profile_page('ian-trainee') ->> 'inSearch')::boolean, false,
  'with nobody supervising him, his profile says it is out of search');
select is(pg_temp.on_city_page(), false, 'the city page does not list him');
select is(pg_temp.in_sitemap(), false, 'nor does the sitemap');
select tests.clear_authentication();

update public.instructor_profiles set supervisor_business_id = :'school' where id = :'ian';

select tests.authenticate_as_anon();
select is((public.instructor_profile_page('ian-trainee') ->> 'inSearch')::boolean, true,
  'supervised, he is in search');
select is(pg_temp.on_city_page(), true, 'on the city page');
select is(pg_temp.in_sitemap(), true, 'and in the sitemap');
select tests.clear_authentication();

select * from finish();
rollback;
