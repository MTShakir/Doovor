-- Reminders and the text message allowance (NTF-02, NTF-01, M2-30).
begin;
select plan(8);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- ---------------------------------------------------------------------------------------
-- Which lessons are close enough to remind about.
-- ---------------------------------------------------------------------------------------
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type',
        now() + interval '20 hours', now() + interval '21 hours', 30, 'confirmed', 4200, 'instructor'),
       -- Too far off to be worth asking about yet.
       (:'school', :'ian', :'lee', :'lesson_type',
        now() + interval '40 hours', now() + interval '41 hours', 30, 'confirmed', 4200, 'instructor'),
       -- Nobody is reminded about a lesson that was called off.
       (:'school', :'ian', :'lee', :'lesson_type',
        now() + interval '3 hours', now() + interval '4 hours', 30, 'cancelled', 4200, 'instructor');

-- Scoped to this fixture's own lessons: the database this runs against has a seed in it.
create or replace view pg_temp.due as
  select one from jsonb_array_elements(public.system_due_reminders(26)) as one
   where one ->> 'business_id' = 'bbbb0000-0000-0000-0000-000000000000';

select is(
  (select count(*)::int from pg_temp.due),
  1,
  'only lessons inside the window, and only ones that are still on'
);

select is(
  (select one ->> 'learner_name' from pg_temp.due),
  'Lee One',
  'and the job is told who to remind'
);

select is(
  (select one ->> 'business_plan' from pg_temp.due),
  'free',
  'and what the plan allows'
);

-- ---------------------------------------------------------------------------------------
-- The monthly allowance (NTF-01: 200 on Pro).
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_claim_sms(:'school', 2)),
  true,
  'a Business with an allowance may text'
);

select is(
  (select public.system_claim_sms(:'school', 2)),
  true,
  'and again, up to the cap'
);

select is(
  (select public.system_claim_sms(:'school', 2)),
  false,
  'and not past it'
);

select is(
  (select sent from public.sms_usage where business_id = :'school'),
  2,
  'the count stops at the cap rather than running away'
);

select is(
  (select public.system_claim_sms(:'school', 0)),
  false,
  'a plan with no text messages sends none'
);

select * from finish();
rollback;
