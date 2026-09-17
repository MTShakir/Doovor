-- Who search shows, and hiding from it while keeping the booking link (PUB-04, INS-03, M5-06).
begin;
select plan(9);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

select results_eq(
  $$ select private.instructor_in_search(v, e, l, s)
       from (values ('approved'::public.verification_status, null::date, true, 'active'::public.business_status),
                    ('approved', current_date, true, 'active'),
                    ('approved', current_date - 1, true, 'active'),
                    ('approved', current_date + 30, false, 'active'),
                    ('pending', current_date + 30, true, 'active'),
                    ('approved', current_date + 30, true, 'suspended')) as t(v, e, l, s) $$,
  $$ values (true), (true), (false), (false), (false), (false) $$,
  'in search: approved, a badge in date (today counts), listed, and a Business in good standing; nothing less'
);

update public.instructor_profiles
   set public_slug = 'ian-one', verification_status = 'approved', badge_expiry = current_date + 200
 where id = :'ian';
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

-- Ian hides his profile from search himself (PUB-04).
select tests.authenticate_as(:'ian_user');
update public.instructor_profiles set is_listed = false where id = :'ian';
select tests.clear_authentication();
select is((select is_listed from public.instructor_profiles where id = :'ian'), false, 'an instructor can hide their own profile from search');

select tests.authenticate_as_anon();
select results_eq(
  $$ select (p ->> 'listed')::boolean, (p ->> 'inSearch')::boolean, (p ->> 'takingBookings')::boolean
       from public.instructor_profile_page('ian-one') as p $$,
  $$ values (false, false, true) $$,
  'the profile says it is out of search, and still takes bookings'
);
select isnt(public.booking_page('ian-one'), null, 'and the booking link still opens');
select tests.clear_authentication();

-- Somebody else cannot hide it, or show it again.
select tests.authenticate_as(:'ivy_user');
update public.instructor_profiles set is_listed = true where id = :'ian';
select tests.clear_authentication();
select is((select is_listed from public.instructor_profiles where id = :'ian'), false, 'another instructor at the school cannot change it');

select tests.authenticate_as_anon();
select throws_ok(
  $$ update public.instructor_profiles set is_listed = true where public_slug = 'ian-one' $$,
  '42501', null,
  'and nobody signed out can'
);
select tests.clear_authentication();

-- Listed again, but the badge has run out: out of search, and not taking bookings (acceptance test 10).
update public.instructor_profiles set is_listed = true, badge_expiry = current_date - 1 where id = :'ian';
select tests.authenticate_as_anon();
select results_eq(
  $$ select (p ->> 'listed')::boolean, (p ->> 'inSearch')::boolean, (p ->> 'takingBookings')::boolean
       from public.instructor_profile_page('ian-one') as p $$,
  $$ values (true, false, false) $$,
  'an expired badge takes the profile out of search and says it is not taking new bookings'
);
select is(public.booking_page('ian-one'), null, 'and its booking link takes no bookings');
select tests.clear_authentication();

update public.instructor_profiles set badge_expiry = current_date + 365 where id = :'ian';
select tests.authenticate_as_anon();
select is((select (public.instructor_profile_page('ian-one') ->> 'inSearch')::boolean), true, 'a renewed badge is back in search at once');
select tests.clear_authentication();

select * from finish();
