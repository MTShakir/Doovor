-- A trainee instructor teaches only under someone (INS-04, R-18, M1-14).
begin;
select plan(10);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set learner 'c0000000-0000-0000-0000-000000000001'
\set bee_biz 'bbbb0000-0000-0000-0000-000000000000'
\set owner_user 'b0000000-0000-0000-0000-000000000001'

-- Ivy is a trainee, with nobody supervising her yet.
update public.instructor_profiles set qualification = 'pdi' where id = :'ivy';

select throws_ok(
  format($$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                         buffer_minutes, status, price_pence, source)
            values (%L, %L, %L, 'b2000000-0000-0000-0000-000000000001',
                    '2026-09-15 10:00+01', '2026-09-15 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
         :'bee_biz', :'ivy', :'learner'),
  'P0001',
  'PDI_NOT_LINKED',
  'a trainee with nobody supervising them cannot take a booking (R-18)'
);

-- An approved instructor is not affected.
select lives_ok(
  format($$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                         buffer_minutes, status, price_pence, source)
            values (%L, %L, %L, 'b2000000-0000-0000-0000-000000000001',
                    '2026-09-15 10:00+01', '2026-09-15 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
         :'bee_biz', :'ian', :'learner'),
  'an approved instructor takes bookings as before'
);

-- Who may set a supervisor
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ update public.instructor_profiles set supervisor_business_id = %L where id = %L $$, :'bee_biz', :'ivy'),
  '42501',
  null,
  'a trainee cannot name themselves as supervised: there is no grant on the column'
);
select throws_ok(
  format($$ select public.set_supervisor(%L, true) $$, :'ivy'),
  '42501',
  'NOT_ALLOWED',
  'nor through the function: it is the school that takes responsibility'
);

select tests.authenticate_as(:'owner_user');
select is(public.set_supervisor(:'ivy', true), true, 'the school owner takes responsibility for the trainee');
select ok(
  (select supervisor_business_id = :'bee_biz' from public.instructor_profiles where id = :'ivy'),
  'and the link names the school'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log
    where action = 'instructor.supervision_changed' and entity_id = :'ivy'),
  1,
  'the change is on the record'
);

select lives_ok(
  format($$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                         buffer_minutes, status, price_pence, source)
            values (%L, %L, %L, 'b2000000-0000-0000-0000-000000000001',
                    '2026-09-16 10:00+01', '2026-09-16 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
         :'bee_biz', :'ivy', :'learner'),
  'once supervised, the trainee can take bookings'
);

-- Taking it away again stops them.
select tests.authenticate_as(:'owner_user');
select is(public.set_supervisor(:'ivy', false), false, 'the school can withdraw it');
select tests.clear_authentication();
select throws_ok(
  format($$ insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                         buffer_minutes, status, price_pence, source)
            values (%L, %L, %L, 'b2000000-0000-0000-0000-000000000001',
                    '2026-09-17 10:00+01', '2026-09-17 11:00+01', 30, 'confirmed', 4200, 'instructor') $$,
         :'bee_biz', :'ivy', :'learner'),
  'P0001',
  'PDI_NOT_LINKED',
  'and the trainee stops taking bookings again'
);

select * from finish();
rollback;
