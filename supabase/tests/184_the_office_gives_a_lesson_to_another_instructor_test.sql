-- The school's office gives a lesson to another of its instructors (SCH-02, LRN-06, D-120, D-397).
begin;
select plan(14);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

create or replace function pg_temp.lesson(p_business uuid, p_instructor uuid, p_type uuid, p_learner uuid, p_starts timestamptz, p_status text)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, payment_status, payment_mode, price_pence, source)
  values (p_business, p_instructor, p_learner, p_type, p_starts, p_starts + interval '1 hour', 0,
          p_status::public.booking_status, 'unpaid', 'at_booking', 4200, 'instructor')
  returning id;
$$;

-- Lee's lesson with Ian tomorrow, and Lou's with Ivy at the same time.
create temp table tomorrow as select date_trunc('hour', now()) + interval '1 day' as at;
grant select on tomorrow to authenticated;
select pg_temp.lesson(:'school', :'ian', 'b2000000-0000-0000-0000-000000000001', :'lee', (select at from tomorrow), 'confirmed') as lees \gset
select pg_temp.lesson(:'school', :'ivy', 'b2000000-0000-0000-0000-000000000001', :'lou', (select at from tomorrow), 'confirmed') as lous \gset

select tests.authenticate_as(:'manager');
select is(
  (select jsonb_agg(jsonb_build_object('id', c ->> 'instructor_id', 'problem', c ->> 'problem'))
     from jsonb_array_elements(public.lesson_cover_choices(:'lees')) as c),
  jsonb_build_array(jsonb_build_object('id', :'ivy', 'problem', 'SLOT_TAKEN')),
  'the office sees who else teaches at the school, and that Ivy is busy then'
);
select throws_ok(
  format('select public.give_lesson_to(%L, %L)', :'lees', :'ivy'),
  'SLOT_TAKEN',
  'and cannot give her a lesson at a time she is teaching'
);

-- Ivy's lesson called off, she is free.
select tests.clear_authentication();
update public.bookings set status = 'cancelled', cancelled_at = now() where id = :'lous';
select tests.authenticate_as(:'manager');
select is(
  (select c -> 'problem' from jsonb_array_elements(public.lesson_cover_choices(:'lees')) as c where c ->> 'instructor_id' = :'ivy'),
  'null'::jsonb,
  'once she is free she can be chosen'
);

-- An instructor does not give their own lessons away; the office decides who teaches whom.
select tests.authenticate_as(:'ian_user');
select throws_ok(format('select public.give_lesson_to(%L, %L)', :'lees', :'ivy'), '42501', null, 'an instructor cannot give a lesson to somebody else');
select throws_ok(format('select public.lesson_cover_choices(%L)', :'lees'), '42501', null, 'nor see who could take it');

select tests.authenticate_as(:'manager');
select lives_ok(format('select public.give_lesson_to(%L, %L)', :'lees', :'ivy'), 'the office gives Lee''s lesson to Ivy');
select tests.clear_authentication();
select is((select instructor_id from public.bookings where id = :'lees'), :'ivy'::uuid, 'it is in her diary now, at the same time');
select is(
  (select array[before ->> 'instructor_name', after ->> 'instructor_name']
     from public.audit_log where action = 'booking.reassigned' and entity_id = :'lees'),
  array['Ian', 'Ivy'],
  'and the record says from whom to whom'
);
select is(
  (select payload from public.outbox_events where name = 'booking.reassigned' and payload ->> 'booking_id' = :'lees'),
  jsonb_build_object('booking_id', :'lees', 'was_instructor_id', :'ian', 'actor', :'manager'),
  'everybody is told, from an event that carries ids and no names'
);
select is(
  public.system_instructor_named(:'ian'),
  jsonb_build_object('user_id', :'ian_user', 'name', 'Ian'),
  'the job names the instructor it was taken from'
);

-- What cannot be given: a lesson already over, and one at a Business that is not a school.
select pg_temp.lesson(:'school', :'ian', 'b2000000-0000-0000-0000-000000000001', :'lee', now() - interval '3 hours', 'completed') as taught \gset
select tests.authenticate_as(:'manager');
select throws_ok(format('select public.give_lesson_to(%L, %L)', :'taught', :'ivy'), 'VALIDATION_FAILED', 'a lesson already taught stays whose it was');
select tests.clear_authentication();
select pg_temp.lesson('aaaa0000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', :'lee',
                      (select at from tomorrow) + interval '3 hours', 'confirmed') as ashas \gset
select tests.authenticate_as(:'asha_user');
select throws_ok(format('select public.give_lesson_to(%L, %L)', :'ashas', 'a1000000-0000-0000-0000-000000000001'), '42501', null,
  'an instructor on their own has nobody to give a lesson to');

-- A trainee nobody supervises is not given one.
select tests.clear_authentication();
update public.instructor_profiles set qualification = 'pdi', supervisor_business_id = null, supervisor_instructor_id = null where id = :'ian';
select tests.authenticate_as(:'manager');
select throws_ok(format('select public.give_lesson_to(%L, %L)', :'lees', :'ian'), 'PDI_NOT_LINKED', 'a trainee nobody supervises cannot take it');

select ok(
  not has_function_privilege('authenticated', 'public.system_instructor_named(uuid)', 'execute'),
  'only the job runner names an instructor this way'
);

select * from finish();
rollback;
