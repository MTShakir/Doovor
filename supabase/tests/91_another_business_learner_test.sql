-- Another Business's learner, asked for by id, is not found (NFR-SEC-01, PRD 17.2 acceptance test 7,
-- M5-23, D-131).
--
-- The owner of Business A asks for Lou, who learns only at Business B, through each table and view
-- that holds a learner's rows and each function that reads one learner by id. Every answer is the
-- answer for an id that belongs to nobody. Lee learns at both, so the same questions find him: they
-- are questions that can find a learner. 03_learner_privacy_test.sql covers what each role may read.
begin;
select plan(10);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set nobody 'f0000000-0000-0000-0000-000000000404'

-- Something of Lou's at the school in each kind of place, so there is something to find.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, payment_mode, price_pence, source)
values (:'school', :'ivy', :'lou', 'b2000000-0000-0000-0000-000000000001',
        now() + interval '3 days', now() + interval '3 days 1 hour', 30, 'confirmed', 'offline', 4200, 'instructor');
insert into public.learner_notes (business_id, learner_id, author_id, body)
values (:'school', :'lou', 'b0000000-0000-0000-0000-000000000004', 'Ready for her test');
insert into public.pickup_points (learner_id, business_id, kind, label, address)
values (:'lou', :'school', 'home', 'Home', '4 Hyde Park Road');

-- How many rows of a learner's the caller can read, place by place.
create function pg_temp.rows_of(p_learner uuid)
returns table (place text, found bigint) language sql as $$
  select 'users', (select count(*) from public.users where id = p_learner)
  union all select 'learner_profiles', (select count(*) from public.learner_profiles where user_id = p_learner)
  union all select 'learner_private', (select count(*) from public.learner_private where user_id = p_learner)
  union all select 'learner_relationships', (select count(*) from public.learner_relationships where learner_id = p_learner)
  union all select 'learner_card', (select count(*) from public.learner_card where learner_id = p_learner)
  union all select 'learner_list', (select count(*) from public.learner_list where learner_id = p_learner)
  union all select 'learner_notes', (select count(*) from public.learner_notes where learner_id = p_learner)
  union all select 'pickup_points', (select count(*) from public.pickup_points where learner_id = p_learner)
  union all select 'bookings', (select count(*) from public.bookings where learner_id = p_learner)
  union all select 'lesson_records', (select count(*) from public.lesson_records where learner_id = p_learner)
  union all select 'skill_progress', (select count(*) from public.skill_progress where learner_id = p_learner)
  union all select 'credit_lots', (select count(*) from public.credit_lots where learner_id = p_learner)
  union all select 'payments', (select count(*) from public.payments where learner_id = p_learner)
  union all select 'refunds', (select count(*) from public.refunds where learner_id = p_learner)
$$;

select tests.authenticate_as(:'asha_user');

select results_eq(
  format($$ select place, found from pg_temp.rows_of(%L) $$, :'lou'),
  format($$ select place, found from pg_temp.rows_of(%L) $$, :'nobody'),
  'every table and view answers for Business B''s learner as for an id that belongs to nobody'
);
select is(
  (select sum(found)::int from pg_temp.rows_of(:'lou')),
  0,
  'which is nothing at all'
);
select ok(
  (select found from pg_temp.rows_of(:'lee') where place = 'learner_card') = 1
    and (select found from pg_temp.rows_of(:'lee') where place = 'users') = 1,
  'while the same questions find a learner of Business A''s own'
);

select throws_ok(
  format($$ select * from public.learner_history(%L) $$, :'lou'),
  '42501', 'NOT_FOUND', 'the learner''s history is not found'
);
select throws_ok(
  format($$ select * from public.learner_history(%L) $$, :'nobody'),
  '42501', 'NOT_FOUND', 'just as for nobody'
);
select lives_ok(
  format($$ select * from public.learner_history(%L) $$, :'lee'),
  'while Business A reads its own learner''s'
);
select throws_ok(
  format($$ select public.learner_balance(%L, %L) $$, :'school', :'lou'),
  '42501', 'NOT_FOUND', 'the learner''s balance at Business B is not found'
);
select throws_ok(
  format($$ select public.learner_balance(%L, %L) $$, :'school', :'nobody'),
  '42501', 'NOT_FOUND', 'just as for nobody'
);
select is(
  public.learner_balance(:'asha_biz', :'lou'),
  public.learner_balance(:'asha_biz', :'nobody'),
  'and at Business A there is nothing of theirs, as there is nothing of nobody''s'
);
select throws_ok(
  format($$ select public.add_learner('a1000000-0000-0000-0000-000000000001', %L) $$, :'lou'),
  '42501', 'NOT_FOUND', 'nor can Business A take the learner on by their id'
);

select * from finish();
rollback;
