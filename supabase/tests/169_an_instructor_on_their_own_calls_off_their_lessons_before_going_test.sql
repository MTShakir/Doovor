-- An instructor on their own calls off their lessons before their account goes (AUTH-09, R-08, D-149, D-361).
begin;
select plan(5);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set asha_type 'a2000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set school_type 'b2000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'

-- Asha runs her Business alone and has a lesson with Lee still to come.
insert into public.bookings (id, business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes,
                             status, payment_status, price_pence, source)
values ('e1690000-0000-0000-0000-000000000001', :'asha_biz', :'asha', :'lee', :'asha_type',
        date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 1 hour', 30,
        'confirmed', 'unpaid', 4200, 'self');

select tests.authenticate_as(:'asha_user');
select throws_ok(
  $$ select public.request_account_deletion('Retiring') $$,
  'P0001', 'LESSONS_TO_COME',
  'an instructor on their own with a lesson still to come is asked to call it off first'
);
select is(
  (select count(*)::int from public.deletion_requests where user_id = :'asha_user'),
  0,
  'and nothing is asked for yet'
);
select tests.clear_authentication();

-- Called off, she can ask.
update public.bookings set status = 'cancelled', cancelled_at = now() where id = 'e1690000-0000-0000-0000-000000000001';
select tests.authenticate_as(:'asha_user');
select lives_ok(
  $$ select public.request_account_deletion('Retiring') $$,
  'with nothing still to come, she can ask for her account to go'
);
select tests.clear_authentication();

-- A school's owner is not alone: the school sees to the lessons, as for anybody leaving it (D-120).
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes,
                             status, payment_status, price_pence, source)
values (:'school', :'ian', :'lee', :'school_type',
        date_trunc('hour', now()) + interval '4 days', date_trunc('hour', now()) + interval '4 days 1 hour', 30,
        'confirmed', 'unpaid', 4200, 'self');
select tests.authenticate_as(:'ben');
select lives_ok(
  $$ select public.request_account_deletion(null) $$,
  'the owner of a school with other people in it can ask'
);
select tests.clear_authentication();

-- And a learner with lessons to come can ask, as before: theirs are called off when the account goes.
select tests.authenticate_as(:'lee');
select lives_ok(
  $$ select public.request_account_deletion(null) $$,
  'a learner with lessons still to come can ask, as before'
);
select tests.clear_authentication();

select * from finish();
rollback;
