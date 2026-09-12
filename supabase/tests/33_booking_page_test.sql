-- The public booking link (BOK-02, M2-17).
begin;
select plan(8);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

update public.instructor_profiles
   set public_slug = 'ian-one', verification_status = 'approved', badge_expiry = current_date + 200,
       buffer_minutes = 30, instant_book = true
 where id = :'ian';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
values (:'ian', :'school', 2, '09:00', '17:00');
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200);

-- A stranger, with no account at all.
select tests.authenticate_as_anon();

select is(
  (select public.booking_page('ian-one') ->> 'name'),
  'Ian',
  'a visitor with no account sees who they would be booking with'
);
select is(
  (select jsonb_array_length(public.booking_page('ian-one') -> 'lessons')),
  1,
  'and what is on offer, with its price'
);
select is(
  (select public.booking_page('nobody-at-all')),
  null,
  'a link that belongs to nobody says nothing'
);

-- Three weeks out, on a Tuesday: inside the horizon, outside the notice.
select (date_trunc('week', current_date + 21) + interval '1 day')::date as tuesday \gset

select is(
  (select count(*)::int from public.open_slots(:'ian', :'tuesday'::date, 60)),
  15,
  'every half hour from nine to four is free on an empty day'
);
select is(
  (select min(candidate) from public.open_slots(:'ian', :'tuesday'::date, 60) as candidate),
  (select (:'tuesday'::date + time '09:00') at time zone 'Europe/London'),
  'the first of them is when the instructor opens'
);

-- A lesson in the middle of the day takes its slot, and the half hour of travel after it.
select tests.clear_authentication();
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lou', :'lesson_type',
        (:'tuesday'::date + time '12:00') at time zone 'Europe/London',
        (:'tuesday'::date + time '13:00') at time zone 'Europe/London',
        30, 'confirmed', 4200, 'instructor');

select tests.authenticate_as_anon();
-- Noon to one, and travel until half past. An hour long lesson starting at eleven, half
-- past eleven, noon, half past twelve or one would run into it: five of the fifteen go.
select is(
  (select count(*)::int from public.open_slots(:'ian', :'tuesday'::date, 60)),
  10,
  'a lesson takes itself and the times either side of it out of the list'
);

-- An instructor nobody has checked takes no bookings from strangers.
select tests.clear_authentication();
update public.instructor_profiles set verification_status = 'pending' where id = :'ian';
select tests.authenticate_as_anon();

select is(
  (select public.booking_page('ian-one')),
  null,
  'an instructor waiting to be verified has no booking page'
);
select is(
  (select count(*)::int from public.open_slots(:'ian', :'tuesday'::date, 60)),
  0,
  'and no times to offer'
);

select * from finish();
rollback;
