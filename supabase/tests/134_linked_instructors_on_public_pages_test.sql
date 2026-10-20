-- Linked instructors on the public pages: the profile names the school, the school's page lists
-- them, and the platform's tick is only where the platform checked the badge (M9-09, D-285).
begin;
select plan(11);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('M1 1AE', 'M1', 'M', 53.47941, -2.24531, 'Manchester')
on conflict (postcode) do update set admin_district = excluded.admin_district;

-- Bee School and both instructors are in central Manchester. Asha runs her own Business and the
-- platform checked her badge; Ian teaches under the school, which vouches for him.
update public.businesses set base_postcode = 'M1 1AE' where id = :'school';
update public.instructor_profiles
   set public_slug = 'asha-one', verification_status = 'approved', verified_at = now(),
       badge_expiry = private.today() + 200, base_postcode = 'M1 1AE'
 where id = :'asha';
update public.instructor_profiles
   set public_slug = 'ian-one', badge_expiry = private.today() + 200, base_postcode = 'M1 1AE'
 where id = :'ian';

create function pg_temp.ticks() returns text[] language sql as $$
  select array_agg((x ->> 'slug') || ' ' || (x ->> 'platformChecked') order by x ->> 'slug')
    from jsonb_array_elements(public.city_page('manchester') -> 'instructors') as x
   where x ->> 'slug' in ('asha-one', 'ian-one')
$$;

select tests.authenticate_as_anon();

select is(
  public.instructor_profile_page('asha-one') -> 'linkedSchool',
  'null'::jsonb,
  'an instructor on their own names no school'
);
select is(pg_temp.ticks(), array['asha-one true', 'ian-one false'], 'and the city page ticks the badge the platform checked, not the one a school vouches for');

reset role;
insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');
select tests.authenticate_as_anon();

select is(
  public.instructor_profile_page('asha-one') -> 'linkedSchool',
  '{"name": "Bee School", "slug": "bee-school", "citySlug": "manchester"}'::jsonb,
  'linked, her profile names the school and where its page is'
);
select is(
  (public.instructor_profile_page('asha-one') ->> 'platformChecked')::boolean,
  true,
  'and keeps the tick the platform gave her before she linked'
);
select is(
  (select array_agg(x ->> 'slug') from jsonb_array_elements(public.school_profile_page('bee-school') -> 'linked') as x),
  array['asha-one'],
  'the school''s page lists her beside its own'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.school_profile_page('bee-school') #> '{linked,0}') as k),
  array['business', 'car', 'citySlug', 'hourlyFromPence', 'instructorId', 'name', 'photoPath', 'platformChecked', 'qualification',
        'slug', 'takingBookings', 'transmission'],
  'with these fields and no others'
);
select is(
  public.school_profile_page('bee-school') #> '{linked,0,business}',
  '{"name": "Asha Driving", "type": "independent"}'::jsonb,
  'by the Business she runs'
);

-- Linked before the platform checked her, the school vouched for her badge instead.
reset role;
update public.instructor_profiles set vouched_at = now() where id = :'asha';
select tests.authenticate_as_anon();

select is(
  (public.instructor_profile_page('asha-one') ->> 'platformChecked')::boolean,
  false,
  'a badge the school vouched for has no tick on the profile'
);
select is(
  (public.school_profile_page('bee-school') #>> '{linked,0,platformChecked}')::boolean,
  false,
  'nor on the school''s page'
);
select is(pg_temp.ticks(), array['asha-one false', 'ian-one false'], 'nor on the city page');

-- She leaves, and the pages no longer say so.
reset role;
update public.school_links
   set status = 'ended', ended_at = now(), end_reason = 'left', ended_by = :'asha_user'
 where business_id = :'asha_biz';
select tests.authenticate_as_anon();

select is(
  jsonb_build_array(public.instructor_profile_page('asha-one') -> 'linkedSchool', public.school_profile_page('bee-school') -> 'linked'),
  '[null, []]'::jsonb,
  'once she leaves, neither page names the other'
);

select * from finish();
rollback;
