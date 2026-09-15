-- The public school profile, and the instructors it lists (PUB-01, M5-03).
begin;
select plan(12);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Bee School is in central Manchester. Ian lives by Stockport and is listed; Ivy is approved but
-- hidden from search. The school charges £42 an hour; Ian also sells two hours for £80.
insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('M1 1AE', 'M1', 'M', 53.47941, -2.24531, 'Manchester'),
       ('SK1 1EB', 'SK1', 'SK', 53.4106, -2.1575, 'Stockport')
on conflict (postcode) do update set admin_district = excluded.admin_district;

update public.businesses set base_postcode = 'M1 1AE' where id = :'school';
update public.instructor_profiles
   set public_slug = 'ian-one', verification_status = 'approved', badge_expiry = current_date + 200,
       base_postcode = 'SK1 1EB', car_make = 'Ford', car_model = 'Fiesta'
 where id = :'ian';
update public.instructor_profiles
   set public_slug = 'ivy-two', verification_status = 'approved', is_listed = false
 where id = :'ivy';
insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', null, 60, 4200),
       (:'school', :'lesson_type', :'ian', 120, 8000);
insert into public.packages (business_id, name, minutes, price_pence, lesson_type_id, expiry_days)
values (:'school', '10 hours', 600, 40000, :'lesson_type', 365);

select tests.authenticate_as_anon();

-- Private fields absent: the page and each instructor on it are exactly these lists.
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.school_profile_page('bee-school')) as k),
  array['instructors', 'lessons', 'logoPath', 'name', 'outcode', 'packages', 'place', 'slug'],
  'the school profile is these fields and no others'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.school_profile_page('bee-school') #> '{instructors,0}') as k),
  array['car', 'citySlug', 'hourlyFromPence', 'instructorId', 'name', 'photoPath', 'qualification', 'slug', 'takingBookings',
        'transmission'],
  'and each instructor on it is these'
);
select ok(
  (select public.school_profile_page('bee-school')::text not like '%M1 1AE%'
      and public.school_profile_page('bee-school')::text not like '%SK1 1EB%'
      and public.school_profile_page('bee-school')::text not like '%234567%'
      and public.school_profile_page('bee-school')::text not like '%test.local%'),
  'no postcode, badge number or email anywhere in it'
);
select is(
  (select public.school_profile_page('bee-school') -> 'place'),
  '{"citySlug": "manchester", "cityName": "Manchester", "areaSlug": null, "areaName": null, "hasHub": true}'::jsonb,
  'the school knows its city'
);
select is(
  (select jsonb_agg(instructor ->> 'slug') from jsonb_array_elements(public.school_profile_page('bee-school') -> 'instructors') as instructor),
  '["ian-one"]'::jsonb,
  'it lists the instructors a learner could find anyway: approved, and not hidden from search'
);
select results_eq(
  $$ select p #>> '{instructors,0,citySlug}', (p #>> '{instructors,0,hourlyFromPence}')::int, p #>> '{instructors,0,car}'
       from public.school_profile_page('bee-school') as p $$,
  $$ values ('manchester', 4000, 'Ford Fiesta') $$,
  'each with the city of their own profile, and the lowest price for an hour, counting their own prices'
);
select results_eq(
  $$ select jsonb_array_length(p -> 'lessons'), p #>> '{lessons,0,name}', (p #>> '{lessons,0,pricePence}')::int,
            p #>> '{packages,0,name}'
       from public.school_profile_page('bee-school') as p $$,
  $$ values (1, 'Standard lesson', 4200, '10 hours') $$,
  'the prices are the school''s own, with its packages'
);
select is(public.school_profile_page('asha-driving'), null, 'a Business of one has an instructor profile, not a school profile');
select is(public.school_profile_page('nobody-at-all'), null, 'and a slug that is nobody''s has none');

select tests.clear_authentication();
update public.instructor_profiles set verification_status = 'pending' where id = :'ian';
select tests.authenticate_as_anon();
select is(
  (select public.school_profile_page('bee-school') -> 'instructors'),
  '[]'::jsonb,
  'an instructor waiting to be checked is not listed'
);

select tests.clear_authentication();
update public.businesses set status = 'suspended' where id = :'school';
select tests.authenticate_as_anon();
select is(public.school_profile_page('bee-school'), null, 'a suspended school has no public page');
select tests.clear_authentication();

update public.businesses set status = 'active' where id = :'school';
select tests.authenticate_as('c0000000-0000-0000-0000-000000000001');
select isnt(public.school_profile_page('bee-school'), null, 'a signed-in learner reads the same page as anybody');
select tests.clear_authentication();

select * from finish();
