-- The public instructor profile, and nothing private on it (PUB-01, INS-05, M5-02).
begin;
select plan(20);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Ian lives by a Manchester postcode, works every day from nine to five, and publishes a price
-- and a package. Ivy has not been checked yet.
insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('M1 1AE', 'M1', 'M', 53.47941, -2.24531, 'Manchester')
on conflict (postcode) do update set admin_district = excluded.admin_district;

update public.instructor_profiles
   set public_slug = 'ian-one', verification_status = 'approved', badge_expiry = current_date + 200,
       bio = 'Calm lessons for nervous drivers.', car_make = 'Toyota', car_model = 'Yaris',
       base_postcode = 'M1 1AE',
       base_location = extensions.st_setsrid(extensions.st_makepoint(-2.24531, 53.47941), 4326)::extensions.geography,
       specialisms = array['nervous_drivers'], radius_miles = 8
 where id = :'ian';
update public.instructor_profiles set public_slug = 'ivy-two' where id = :'ivy';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', day, '09:00', '17:00' from generate_series(1, 7) as day;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);
insert into public.packages (business_id, name, minutes, price_pence, lesson_type_id)
values (:'school', '10 hours', 600, 40000, :'lesson_type');
insert into public.coverage_districts (instructor_id, business_id, outcode, rule)
values (:'ian', :'school', 'M20', 'include'), (:'ian', :'school', 'M4', 'exclude');

select tests.authenticate_as_anon();

-- Private fields absent: the page is exactly this list, so anything new is private by default.
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.instructor_profile_page('ian-one')) as k),
  array['alsoCovers', 'areaCentre', 'bio', 'business', 'car', 'dualControls', 'inSearch', 'instantBook', 'instructorId',
        'languages', 'lessons', 'listed', 'name', 'outcode', 'packages', 'photoPath', 'place', 'qualification',
        'radiusMiles', 'slug', 'specialisms', 'takingBookings', 'transmission', 'yearsTeaching'],
  'the profile is these fields and no others'
);
select ok(
  (select public.instructor_profile_page('ian-one')::text not like '%M1 1AE%'
      and public.instructor_profile_page('ian-one')::text not like '%234567%'
      and public.instructor_profile_page('ian-one')::text not like '%test.local%'
      and public.instructor_profile_page('ian-one')::text not like '%' || to_char(current_date + 200, 'YYYY-MM-DD') || '%'),
  'no home postcode, badge number, badge date or email anywhere in it'
);
select is(
  (select public.instructor_profile_page('ian-one') -> 'areaCentre'),
  '{"latitude": 53.48, "longitude": -2.25}'::jsonb,
  'the area covered is drawn from a point rounded to about a kilometre'
);
select is(
  (select public.instructor_profile_page('ian-one') ->> 'outcode'),
  'M1',
  'and named by its district, not the postcode'
);
select is(
  (select public.instructor_profile_page('ian-one') -> 'alsoCovers'),
  '["M20"]'::jsonb,
  'the districts added to the circle are listed, and the ones taken out are not'
);
select is(
  (select public.instructor_profile_page('ian-one') -> 'place'),
  '{"citySlug": "manchester", "cityName": "Manchester", "areaSlug": null, "areaName": null, "hasHub": true}'::jsonb,
  'the profile knows its city, for its address and its breadcrumb'
);
select results_eq(
  $$ select p ->> 'name', p ->> 'car', (p ->> 'takingBookings')::boolean, jsonb_array_length(p -> 'lessons'),
            p #>> '{packages,0,name}', p #>> '{business,slug}'
       from public.instructor_profile_page('ian-one') as p $$,
  $$ values ('Ian', 'Toyota Yaris', true, 1, '10 hours', 'bee-school') $$,
  'with the car, the prices, the packages and the school, taking bookings'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.instructor_profile_page('ian-one') -> 'business') as k),
  array['citySlug', 'name', 'slug', 'type'],
  'the Business is named with where its own profile lives, and nothing more'
);
select is(public.instructor_profile_page('ivy-two'), null, 'an instructor not yet checked has no profile');
select is(public.instructor_profile_page('nobody-at-all'), null, 'and a slug that is nobody''s has none either');

-- The next free times: half hours in London, soonest first, all to come.
select is((select count(*)::int from public.next_open_slots(:'ian', 60)), 3, 'three free times unless asked for more');
select is((select count(*)::int from public.next_open_slots(:'ian', 60, 50)), 10, 'never more than ten');
select ok(
  (select bool_and(s > now()) and bool_and(extract(minute from s at time zone 'Europe/London') in (0, 30))
     from public.next_open_slots(:'ian', 60, 10) as s),
  'every one is to come, and on the hour or the half hour in London'
);
select is(
  (select array_agg(s) from public.next_open_slots(:'ian', 60, 10) as s),
  (select array_agg(s order by s) from public.next_open_slots(:'ian', 60, 10) as s),
  'soonest first'
);
select is((select count(*)::int from public.next_open_slots(:'ivy', 60)), 0, 'an instructor not yet checked has no free times to offer');

select tests.clear_authentication();
select is(
  (select count(*)::int from public.next_open_slots(:'ian', 60, 10) as s
    where private.slot_problem(:'ian', s, 60, 'learner', null, now()) is not null),
  0,
  'and each could be booked, by the rules the booking itself is held to'
);

-- A badge out of date: the profile stays, saying so, and offers no times.
update public.instructor_profiles set badge_expiry = current_date - 1 where id = :'ian';
select tests.authenticate_as_anon();
select is(
  (select (public.instructor_profile_page('ian-one') ->> 'takingBookings')::boolean),
  false,
  'an instructor whose badge is out of date is not taking new bookings'
);
select is((select count(*)::int from public.next_open_slots(:'ian', 60)), 0, 'and offers no times');

-- A suspended Business: nothing public at all.
select tests.clear_authentication();
update public.instructor_profiles set badge_expiry = current_date + 200 where id = :'ian';
update public.businesses set status = 'suspended' where id = :'school';
select tests.authenticate_as_anon();
select is(public.instructor_profile_page('ian-one'), null, 'the profile of a suspended Business''s instructor is gone');
select is((select count(*)::int from public.next_open_slots(:'ian', 60)), 0, 'with its times');
select tests.clear_authentication();

select * from finish();
