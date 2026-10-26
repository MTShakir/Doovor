-- A school hears of the lessons booked in a morning digest, and of its money only where it may see
-- revenue (PRD Appendix B, PRD 6.2, D-392, D-393).
begin;
select plan(7);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

create or replace function pg_temp.lesson(p_business uuid, p_instructor uuid, p_type uuid, p_learner uuid, p_starts timestamptz, p_status text)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_status, payment_mode, price_pence, source, expires_at)
  values (p_business, p_instructor, p_learner, p_type, p_starts, p_starts + interval '1 hour', 0,
          p_status::public.booking_status, 'unpaid', 'at_booking', 4200, 'instructor',
          case when p_status = 'requested' then now() + interval '12 hours' end)
  returning id;
$$;

create or replace function pg_temp.school_day()
returns jsonb language sql as $$
  select s.value
    from jsonb_array_elements(public.system_daily_booking_summaries(now() - interval '1 day', now() + interval '1 minute')) as s
   where (s.value ->> 'business_id')::uuid = 'bbbb0000-0000-0000-0000-000000000000';
$$;

-- Three lessons on at the school, two of them with Ian, and what is not booked: a request still
-- waiting, and a lesson called off the same day.
select pg_temp.lesson(:'school', :'ian', 'b2000000-0000-0000-0000-000000000001', :'lee', now() + interval '2 days', 'confirmed');
select pg_temp.lesson(:'school', :'ian', 'b2000000-0000-0000-0000-000000000001', :'lee', now() + interval '3 days', 'confirmed');
select pg_temp.lesson(:'school', :'ivy', 'b2000000-0000-0000-0000-000000000001', :'lou', now() + interval '2 days', 'confirmed');
select pg_temp.lesson(:'school', :'ivy', 'b2000000-0000-0000-0000-000000000001', :'lou', now() + interval '4 days', 'requested');
select pg_temp.lesson(:'school', :'ivy', 'b2000000-0000-0000-0000-000000000001', :'lou', now() + interval '5 days', 'cancelled');
-- And one at Asha's own Business, which hears of each lesson as it is booked.
select pg_temp.lesson(:'asha_biz', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', :'lee', now() + interval '6 days', 'confirmed');

select is(
  (pg_temp.school_day() ->> 'count')::int,
  3,
  'the day''s lessons booked at a school count what is on, not a request or a lesson already called off'
);

select is(
  pg_temp.school_day() -> 'instructors',
  '[{"name": "Ian", "count": 2}, {"name": "Ivy", "count": 1}]'::jsonb,
  'each instructor''s share of them comes with it, most first'
);

select is(
  pg_temp.school_day() -> 'user_ids',
  jsonb_build_array(:'ben', :'manager'),
  'and it is for the school''s owner and managers'
);

select is(
  (select count(*)::int from jsonb_array_elements(public.system_daily_booking_summaries(now() - interval '1 day', now() + interval '1 minute'))
    where (value ->> 'business_id')::uuid = :'asha_biz'),
  0,
  'an instructor running a Business of their own gets no digest'
);

-- The day's money: the owner hears of it, and a manager only if the owner lets them see revenue.
insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
values (:'school', :'lee', 4200, 'card', 'paid', now());

select is(
  (select s.value -> 'user_ids'
     from jsonb_array_elements(public.system_daily_payment_summaries(now() - interval '1 day', now() + interval '1 minute')) as s
    where (s.value ->> 'business_id')::uuid = :'school'),
  jsonb_build_array(:'ben'),
  'the day''s payments go to the owner, not to a manager who may not see revenue'
);

update public.memberships set permissions = '{"view_revenue": true}' where business_id = :'school' and user_id = :'manager';
select is(
  (select s.value -> 'user_ids'
     from jsonb_array_elements(public.system_daily_payment_summaries(now() - interval '1 day', now() + interval '1 minute')) as s
    where (s.value ->> 'business_id')::uuid = :'school'),
  jsonb_build_array(:'ben', :'manager'),
  'and to a manager the owner lets see it'
);

select ok(
  not has_function_privilege('authenticated', 'public.system_daily_booking_summaries(timestamptz, timestamptz)', 'execute'),
  'only the job runner sums up a school''s day'
);

select * from finish();
rollback;
