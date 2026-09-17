-- School prices with instructor prices over them: which price wins, everywhere (SCH-04, R-05, M5-15).
begin;
select plan(27);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Ian is listed in Stockport. The school charges £40 for an hour and £72 for an hour and a half,
-- and still has the price of a lesson type it no longer offers.
insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district)
values ('M1 1AE', 'M1', 'M', 53.47941, -2.24531, 'Manchester'),
       ('SK1 1EB', 'SK1', 'SK', 53.4106, -2.1575, 'Stockport')
on conflict (postcode) do update set admin_district = excluded.admin_district;
update public.businesses set base_postcode = 'M1 1AE' where id = :'school';
update public.instructor_profiles
   set public_slug = 'ian-prices', verification_status = 'approved', badge_expiry = current_date + 200, base_postcode = 'SK1 1EB'
 where id = :'ian';
insert into public.lesson_types (id, business_id, name, is_active)
values ('b2000000-0000-0000-0000-000000000002', :'school', 'Motorway lesson', false);
insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence) values
  (:'school', :'lesson_type', null, 60, 4000),
  (:'school', :'lesson_type', null, 90, 7200),
  (:'school', 'b2000000-0000-0000-0000-000000000002', null, 60, 2000);

select id as ian_membership from public.memberships where business_id = :'school' and user_id = :'ian_user' \gset

-- ---------------------------------------------------------------------------------------
-- Who may set an instructor's own price.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence)
            values (%L, %L, %L, 60, 4500) $$, :'school', :'lesson_type', :'ian'),
  '42501', null, 'an instructor the school has not allowed sets no price of their own (SCH-02)'
);

select tests.authenticate_as(:'ben');
select public.set_member_permission(:'ian_membership', 'set_own_prices', true);
select tests.authenticate_as(:'ian_user');
select lives_ok(
  format($$ insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence)
            values (%L, %L, %L, 60, 4500) $$, :'school', :'lesson_type', :'ian'),
  'once allowed, Ian charges £45 for his hours'
);
select throws_ok(
  format($$ insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence)
            values (%L, %L, %L, 60, 1000) $$, :'school', :'lesson_type', :'ivy'),
  '42501', null, 'but sets nobody else''s'
);
update public.lesson_prices set price_pence = 100 where business_id = :'school' and instructor_id is null and duration_minutes = 60;
select tests.clear_authentication();
select is(
  (select price_pence from public.lesson_prices where business_id = :'school' and instructor_id is null and duration_minutes = 60 and lesson_type_id = :'lesson_type'),
  4000,
  'and cannot change the school''s own price'
);

-- ---------------------------------------------------------------------------------------
-- Which price wins.
-- ---------------------------------------------------------------------------------------
select results_eq(
  format($$ select duration_minutes, price_pence from private.effective_lesson_prices(%L) order by duration_minutes $$, :'ian'),
  $$ values (60, 4500), (90, 7200) $$,
  'for Ian, his own price wins for an hour, the school''s stands for an hour and a half, and a lesson type no longer offered has none (SCH-04)'
);
select results_eq(
  format($$ select duration_minutes, price_pence from private.effective_lesson_prices(%L) order by duration_minutes $$, :'ivy'),
  $$ values (60, 4000), (90, 7200) $$,
  'while Ivy teaches at the school''s prices'
);

select tests.authenticate_as_anon();
select results_eq(
  $$ select (l ->> 'durationMinutes')::int, (l ->> 'pricePence')::int from jsonb_array_elements(public.booking_page('ian-prices') -> 'lessons') as l $$,
  $$ values (60, 4500), (90, 7200) $$,
  'his booking link offers each lesson once, at the price that wins'
);
select results_eq(
  $$ select (l ->> 'durationMinutes')::int, (l ->> 'pricePence')::int from jsonb_array_elements(public.instructor_profile_page('ian-prices') -> 'lessons') as l $$,
  $$ values (60, 4500), (90, 7200) $$,
  'and so does his profile'
);
select is(
  (select (x ->> 'hourlyFromPence')::int from jsonb_array_elements(public.school_profile_page('bee-school') -> 'instructors') as x where x ->> 'slug' = 'ian-prices'),
  4500,
  'the school''s page says he is from £45 an hour, not the school''s £40 he no longer charges'
);
select is(
  (select (x ->> 'hourlyFromPence')::int from jsonb_array_elements(public.city_page('manchester', 'stockport') -> 'instructors') as x where x ->> 'slug' = 'ian-prices'),
  4500,
  'and so does the Stockport page'
);
select results_eq(
  $$ select (l ->> 'durationMinutes')::int, (l ->> 'pricePence')::int from jsonb_array_elements(public.school_profile_page('bee-school') -> 'lessons') as l $$,
  $$ values (60, 4000), (90, 7200) $$,
  'while the school''s own prices stay the school''s'
);

select tests.authenticate_as(:'ben');
select public.create_booking(:'ian', :'lee', :'lesson_type', date_trunc('hour', now()) + interval '5 days', 60) as booked \gset
select tests.clear_authentication();
select is((select price_pence from public.bookings where id = :'booked'), 4500, 'a lesson booked with Ian is charged at his price');

-- ---------------------------------------------------------------------------------------
-- Back to the school's prices.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.set_member_permission(%L, 'set_own_prices', false) $$, :'ian_membership'),
  'the owner takes away Ian''s own prices'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.lesson_prices where instructor_id = :'ian'),
  0,
  'his own prices go with it'
);
select results_eq(
  $$ select (l ->> 'durationMinutes')::int, (l ->> 'pricePence')::int from jsonb_array_elements(public.booking_page('ian-prices') -> 'lessons') as l $$,
  $$ values (60, 4000), (90, 7200) $$,
  'and his booking link is at the school''s prices again'
);
select is(
  (select count(*)::int from public.audit_log where action = 'instructor.own_prices_removed' and entity_id = :'ian_membership'),
  1,
  'which the audit log records'
);


-- ---------------------------------------------------------------------------------------
-- Saving several prices at once.
-- ---------------------------------------------------------------------------------------
\set mia 'b0000000-0000-0000-0000-000000000002'
\set asha_type 'a2000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'mia');
select lives_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 60, "price_pence": 4100}, {"lesson_type_id": "%s", "duration_minutes": 120, "price_pence": 8000}]', :'lesson_type', :'lesson_type')),
  'a manager changes the school''s hour and adds a two hour lesson (R-05)'
);
select lives_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 90, "price_pence": null}]', :'lesson_type')),
  'and takes the hour and a half off'
);
select tests.clear_authentication();
select results_eq(
  format($$ select duration_minutes::int, price_pence from public.lesson_prices where lesson_type_id = %L and instructor_id is null order by duration_minutes $$, :'lesson_type'),
  $$ values (60, 4100), (120, 8000) $$,
  'so the school offers an hour at £41 and two hours at £80'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 60, "price_pence": 100000}]', :'lesson_type')),
  '42501', null, 'an instructor does not change the school''s prices'
);
select throws_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb, %L) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 60, "price_pence": 4600}]', :'lesson_type'), :'ian'),
  '42501', null, 'nor their own while the school has not allowed it'
);

select tests.authenticate_as(:'ben');
select public.set_member_permission(:'ian_membership', 'set_own_prices', true);
select tests.authenticate_as(:'ian_user');
select lives_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb, %L) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 60, "price_pence": 4600}, {"lesson_type_id": "%s", "duration_minutes": 120, "price_pence": 9000}]', :'lesson_type', :'lesson_type'), :'ian'),
  'allowed again, Ian saves his own hour and two hours'
);
select throws_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb, %L) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 60, "price_pence": 1000}]', :'lesson_type'), :'ivy'),
  '42501', null, 'but not Ivy''s'
);
select throws_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb, %L) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 120, "price_pence": null}, {"lesson_type_id": "%s", "duration_minutes": 60, "price_pence": 400}]', :'lesson_type', :'lesson_type'), :'ian'),
  'P0001', 'VALIDATION_FAILED', 'a price under £5 is refused, and the whole save with it'
);
select tests.clear_authentication();
select results_eq(
  format($$ select duration_minutes, price_pence from private.effective_lesson_prices(%L) order by duration_minutes $$, :'ian'),
  $$ values (60, 4600), (120, 9000) $$,
  'so both his prices stand as they were'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb, %L) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 50, "price_pence": 4000}]', :'lesson_type'), :'ian'),
  'P0001', 'VALIDATION_FAILED', 'a lesson must be a whole number of quarter hours'
);
select throws_ok(
  format($$ select public.set_lesson_prices(%L, %L::jsonb, %L) $$, :'school',
         format('[{"lesson_type_id": "%s", "duration_minutes": 60, "price_pence": 4000}]', :'asha_type'), :'ian'),
  'P0001', 'VALIDATION_FAILED', 'and of a lesson type the school has'
);

select * from finish();
rollback;
