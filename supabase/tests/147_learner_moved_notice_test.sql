-- The school hears when a learner moves to it, and so does the instructor they came with (D-306).
begin;
select plan(6);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set lyn 'c0000000-0000-0000-0000-000000000009'

-- How many events wait to say a learner moved.
create function pg_temp.queued(p_id uuid)
returns integer
language sql
as $$
  select count(*)::int
    from public.outbox_events
   where name = 'school.notice' and payload ->> 'kind' = 'learner.moved' and payload ->> 'id' = p_id::text;
$$;

-- Who a notice goes to, as "user audience" lines in order.
create function pg_temp.told(p_notice jsonb)
returns text[]
language sql
as $$
  select coalesce(array_agg((r ->> 'user_id') || ' ' || (r ->> 'audience') order by r ->> 'user_id'), '{}')
    from jsonb_array_elements(p_notice -> 'recipients') as r;
$$;

-- Liz learns with Asha, a linked instructor the school introduced her to, and Asha has gone.
insert into public.learner_relationships (business_id, learner_id, instructor_id, introduced_by)
values (:'asha_biz', :'liz', :'asha', :'school');
insert into public.learner_moves (learner_id, from_business_id, to_business_id, reason)
values (:'liz', :'asha_biz', :'school', 'left_school');
select id as back from public.learner_moves where learner_id = :'liz' \gset

select is(public.system_school_notice('learner.moved', :'back'), null, 'nobody is told a learner moved before they answer');

select tests.authenticate_as(:'liz');
select public.answer_learner_move(:'back', true);
reset role;

select is(pg_temp.queued(:'back'), 1, 'going back to the school queues it being told');
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'business', n ->> 'business_id', 'learner', n ->> 'learner_name',
                             'from', n ->> 'business_name', 'school', n ->> 'school_name', 'with', n ->> 'instructor_name', 'why', n ->> 'outcome')
     from public.system_school_notice('learner.moved', :'back') as n),
  jsonb_build_object('told', array[:'ben' || ' school', :'manager' || ' school'], 'business', :'school', 'learner', 'Liz Three',
                     'from', 'Asha Driving', 'school', 'Bee School', 'with', null, 'why', 'left_school'),
  'to the school''s owner and managers, with nobody named to teach her'
);

-- Lyn learns with Asha too, and is asked to follow an instructor to the school. She stays.
select tests.create_user_with_id(:'lyn', 'learner.9@test.local', 'Lyn Nine');
insert into public.learner_profiles (user_id, transmission) values (:'lyn', 'manual');
insert into public.learner_relationships (business_id, learner_id, instructor_id) values (:'asha_biz', :'lyn', :'asha');
insert into public.learner_moves (learner_id, from_business_id, to_business_id, instructor_id, reason)
values (:'lyn', :'asha_biz', :'school', :'ian', 'joined_school');
select id as stay from public.learner_moves where learner_id = :'lyn' \gset

select tests.authenticate_as(:'lyn');
select public.answer_learner_move(:'stay', false);
reset role;
select is(pg_temp.queued(:'stay'), 0, 'a learner who stays is nobody''s news');

-- Asked again, she moves, with the instructor who joined the school.
insert into public.learner_moves (learner_id, from_business_id, to_business_id, instructor_id, reason)
values (:'lyn', :'asha_biz', :'school', :'ian', 'joined_school');
select id as moved from public.learner_moves where learner_id = :'lyn' and status = 'asked' \gset

select tests.authenticate_as(:'lyn');
select public.answer_learner_move(:'moved', true);
reset role;
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'learner', n ->> 'learner_id', 'with', n ->> 'instructor_name', 'why', n ->> 'outcome')
     from public.system_school_notice('learner.moved', :'moved') as n),
  jsonb_build_object('told', array[:'ben' || ' school', :'manager' || ' school', :'ian_user' || ' instructor'], 'learner', :'lyn',
                     'with', 'Ian', 'why', 'joined_school'),
  'to the school, and to the instructor she came with, whose card for her it opens'
);
select is(public.system_school_notice('learner.moved', :'stay'), null, 'the answer she gave first reads as nothing');

select * from finish();
rollback;
