-- A trainee nobody supervises takes no bookings, and the public pages say so before anybody tries
-- (INS-04, R-18, D-343).
begin;
select plan(8);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Ian is a trainee at the school, checked and public, who works every day from nine to five.
insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('M1 1AE', 'M1', 'M', 53.47941, -2.24531, 'Manchester')
on conflict (postcode) do update set admin_district = excluded.admin_district;
update public.instructor_profiles
   set public_slug = 'ian-trainee', verification_status = 'approved', badge_expiry = private.today() + 200,
       qualification = 'pdi', base_postcode = 'M1 1AE',
       base_location = extensions.st_setsrid(extensions.st_makepoint(-2.24531, 53.47941), 4326)::extensions.geography
 where id = :'ian';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ian', :'school', day, '09:00', '17:00' from generate_series(1, 7) as day;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

select tests.authenticate_as_anon();
select is(
  (public.instructor_profile_page('ian-trainee') ->> 'takingBookings')::boolean,
  false,
  'with nobody supervising him, his profile is not taking new bookings'
);
select is((select count(*)::int from public.next_open_slots(:'ian', 60)), 0, 'and offers no free times');
select is(
  (select count(*)::int from public.open_slots(:'ian', private.today() + 2, 60)),
  0,
  'nor does his booking link, on any day'
);
select is(
  (select (s -> 'instructors' -> 0 ->> 'takingBookings')::boolean
     from (select public.school_profile_page('bee-school') as s) page
    where s -> 'instructors' -> 0 ->> 'name' = 'Ian'),
  false,
  'and the school page says the same of him'
);
select tests.clear_authentication();

-- The school supervises him.
update public.instructor_profiles set supervisor_business_id = :'school' where id = :'ian';

select tests.authenticate_as_anon();
select is(
  (public.instructor_profile_page('ian-trainee') ->> 'takingBookings')::boolean,
  true,
  'supervised, his profile takes bookings'
);
select is((select count(*)::int from public.next_open_slots(:'ian', 60)), 3, 'and shows his next free times');
select ok(
  (select count(*)::int from public.open_slots(:'ian', private.today() + 2, 60)) > 0,
  'and his booking link has times to choose'
);
select tests.clear_authentication();

-- An approved instructor is not touched by any of it.
update public.instructor_profiles set qualification = 'adi', supervisor_business_id = null where id = :'ian';
select tests.authenticate_as_anon();
select is(
  (public.instructor_profile_page('ian-trainee') ->> 'takingBookings')::boolean,
  true,
  'an approved instructor takes bookings with no supervisor'
);
select tests.clear_authentication();

select * from finish();
rollback;
