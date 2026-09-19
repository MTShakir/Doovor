-- A reminder sent by hand from a lesson's sheet (NTF-02, D-166).
begin;
select plan(18);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- On a plan with texts to begin with.
update public.businesses set plan = 'pro' where id = :'school';

create or replace function pg_temp.lesson(p_learner uuid, p_starts timestamptz)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          p_learner, 'b2000000-0000-0000-0000-000000000001',
          p_starts, p_starts + interval '1 hour', 30, 'confirmed', 4200, 'instructor')
  returning id;
$$;

select pg_temp.lesson(:'lee', now() + interval '3 days') as lesson \gset
select pg_temp.lesson(:'lee', now() - interval '2 days') as past \gset

-- ---------------------------------------------------------------------------------------
-- The instructor asks for one, and the job is asked to send it.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select lives_ok(
  format($$ select public.request_lesson_reminder(%L, 'email') $$, :'lesson'),
  'the instructor asks for a reminder by email'
);
select tests.clear_authentication();

select is(
  (select count(*)::int from public.outbox_events
    where name = 'booking.reminder_requested' and payload ->> 'booking_id' = :'lesson' and payload ->> 'channel' = 'email'),
  1,
  'the job that sends reminders is asked to send it'
);
select is(
  (select count(*)::int from public.audit_log
    where action = 'booking.reminder_requested' and entity_id = :'lesson'::uuid
      and after ->> 'channel' = 'email' and actor_user_id = :'ian_user'::uuid),
  1,
  'and the audit trail says who asked, and how'
);

-- ---------------------------------------------------------------------------------------
-- Once an hour each way, and only for a lesson still to come.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.request_lesson_reminder(%L, 'email') $$, :'lesson'),
  '53400', 'RATE_LIMITED', 'a second email reminder within the hour is refused'
);
select lives_ok(
  format($$ select public.request_lesson_reminder(%L, 'sms') $$, :'lesson'),
  'a text is a reminder of its own'
);
select is(
  (select public.lesson_reminder_options(:'lesson') ->> 'texts'),
  'true',
  'the sheet may offer a text on a plan with them'
);
select throws_ok(
  format($$ select public.request_lesson_reminder(%L, 'post') $$, :'lesson'),
  'P0001', 'VALIDATION_FAILED', 'and there is no third way'
);
select throws_ok(
  format($$ select public.request_lesson_reminder(%L, 'email') $$, :'past'),
  'P0001', 'VALIDATION_FAILED', 'nor a reminder about a lesson that has happened'
);

-- ---------------------------------------------------------------------------------------
-- A plan without texts: none offered, and none sent.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
update public.businesses set plan = 'free' where id = :'school';
select pg_temp.lesson(:'lee', now() + interval '4 days') as another \gset
select tests.authenticate_as(:'ian_user');
select is(
  (select public.lesson_reminder_options(:'another') ->> 'texts'),
  'false',
  'the free plan offers no text'
);
select throws_ok(
  format($$ select public.request_lesson_reminder(%L, 'sms') $$, :'another'),
  'P0001', 'PLAN_REQUIRED', 'and a text asked for anyway is refused'
);

-- ---------------------------------------------------------------------------------------
-- Nobody else.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.request_lesson_reminder(%L, 'email') $$, :'lesson'),
  '42501', 'NOT_ALLOWED', 'the learner cannot send themselves one'
);
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.request_lesson_reminder(%L, 'email') $$, :'lesson'),
  '42501', 'NOT_ALLOWED', 'nor an instructor with nothing to do with the lesson'
);
select throws_ok(
  format($$ select public.lesson_reminder_options(%L) $$, :'lesson'),
  '42501', 'NOT_ALLOWED', 'nor told what the lesson could have'
);
select throws_ok(
  format($$ select public.request_lesson_reminder(%L, 'email') $$, gen_random_uuid()),
  '42501', 'NOT_FOUND', 'and a lesson that does not exist is simply not found'
);

-- ---------------------------------------------------------------------------------------
-- What the job reads: the lesson as a reminder needs it, and only the job may read it.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select is(
  public.system_reminder_notice(:'lesson') ->> 'learner_user_id',
  :'lee',
  'the job reads who to remind'
);
select ok(
  public.system_reminder_notice(:'lesson') ? 'business_plan',
  'and the plan, which decides whether a text may go'
);
select ok(public.system_reminder_notice(:'past') is null, 'and nothing for a lesson that has happened');

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.system_reminder_notice(%L) $$, :'lesson'),
  '42501', null, 'which nobody signed in can read'
);

select * from finish();
rollback;
