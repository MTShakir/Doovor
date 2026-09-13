-- The notification core (NTF-01, NTF-03, NTF-04, M2-27).
begin;
select plan(14);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- ---------------------------------------------------------------------------------------
-- The dedupe key: a job that runs twice writes one row.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_notify(jsonb_build_array(
     jsonb_build_object(
       'user_id', :'lee', 'business_id', :'school', 'kind', 'booking.confirmed',
       'category', 'bookings', 'title', 'Lesson booked', 'body', 'Wed 16 Sep at 09:00 with Ian.',
       'link', '/app/learner/lessons', 'channels', jsonb_build_array('in_app', 'push'),
       'entity_type', 'booking', 'entity_id', 'e1000000-0000-0000-0000-000000000001',
       'dedupe_key', 'booking.confirmed:e1:1:lee'
     )
   ))),
  1,
  'a job writes the notification it decided to send'
);

select is(
  (select public.system_notify(jsonb_build_array(
     jsonb_build_object(
       'user_id', :'lee', 'kind', 'booking.confirmed', 'category', 'bookings',
       'title', 'Lesson booked', 'body', 'Wed 16 Sep at 09:00 with Ian.',
       'dedupe_key', 'booking.confirmed:e1:1:lee'
     )
   ))),
  0,
  'and the same key again writes nothing, however many times the job runs'
);

select is(
  (select count(*)::int from public.notifications where dedupe_key = 'booking.confirmed:e1:1:lee'),
  1,
  'so there is one of it'
);

select is(
  (select channels::text from public.notifications where dedupe_key = 'booking.confirmed:e1:1:lee'),
  '{in_app,push}',
  'with the channels the plan chose'
);

-- The same lesson, changed: a new version is a new notification, not a swallowed one.
select is(
  (select public.system_notify(jsonb_build_array(
     jsonb_build_object(
       'user_id', :'lee', 'kind', 'booking.rescheduled', 'category', 'bookings',
       'title', 'Lesson moved', 'body', 'Now Thu 17 Sep at 09:00 with Ian.',
       'dedupe_key', 'booking.rescheduled:e1:2:lee'
     )
   ))),
  1,
  'the same lesson at a new version is told again'
);

-- ---------------------------------------------------------------------------------------
-- Whose inbox it is.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select is(
  (select count(*)::int from public.notifications),
  2,
  'somebody sees their own notifications'
);

select lives_ok(
  $$ update public.notifications set read_at = now() where read_at is null $$,
  'and can mark them read'
);

select tests.clear_authentication();
select tests.authenticate_as(:'ian_user');
select is(
  (select count(*)::int from public.notifications),
  0,
  'and nobody else sees them'
);

select throws_ok(
  format($$ insert into public.notifications (user_id, kind, category, title, body, dedupe_key)
            values (%L, 'booking.confirmed', 'bookings', 'Made up', 'Not from a job', 'made-up:1') $$, :'ian_user'),
  '42501', null, 'a person cannot write themselves a notification'
);

-- ---------------------------------------------------------------------------------------
-- What may be switched off (NTF-04).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select tests.authenticate_as(:'lee');

select lives_ok(
  $$ insert into public.notification_preferences (user_id, category, channel, enabled)
     values ((select auth.uid()), 'reminders', 'email', false) $$,
  'somebody switches a channel off for themselves'
);

select throws_ok(
  format($$ insert into public.notification_preferences (user_id, category, channel, enabled)
            values (%L, 'reminders', 'email', false) $$, :'ian_user'),
  '42501', null, 'and cannot switch anything off for anybody else'
);

select tests.clear_authentication();
select is(
  (select string_agg(channel::text, ',' order by channel::text)
     from public.system_notification_mutes(array[:'lee'::uuid, :'ian_user'::uuid], 'reminders')),
  'email',
  'the job is told what they switched off, and nothing else'
);

-- ---------------------------------------------------------------------------------------
-- Who a lesson concerns (PRD Appendix B).
-- ---------------------------------------------------------------------------------------
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', 'b1000000-0000-0000-0000-000000000001', :'lee', 'b2000000-0000-0000-0000-000000000001',
        now() + interval '3 days', now() + interval '3 days 1 hour', 30, 'confirmed', 4200, 'instructor')
returning id as lesson \gset

select is(
  (select public.system_booking_notice(:'lesson') ->> 'instructor_name'),
  'Ian',
  'a job is told who is teaching it, and who it is for'
);

select is(
  (select string_agg(value, ',' order by value)
     from jsonb_array_elements_text(public.system_booking_notice(:'lesson') -> 'school_user_ids') as value),
  'b0000000-0000-0000-0000-000000000001,b0000000-0000-0000-0000-000000000002',
  'and that the school owner and the manager hear about it, but not the instructor twice'
);

select * from finish();
rollback;
