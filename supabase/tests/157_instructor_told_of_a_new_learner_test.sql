-- An instructor is told when the school gives them a learner, and only then (NTF-03, SCH-03, D-325).
begin;
select plan(7);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set liz 'c0000000-0000-0000-0000-000000000003'

-- How many events wait to tell about one learner's link to the school.
create function pg_temp.queued(p_id uuid)
returns integer
language sql
as $$
  select count(*)::int
    from public.outbox_events
   where name = 'school.notice' and payload ->> 'kind' = 'learner.assigned' and payload ->> 'id' = p_id::text;
$$;

select id as lee_link from public.learner_relationships where business_id = :'school' and learner_id = :'lee' \gset

-- Lee learns with Ian. The office gives him to Ivy.
select tests.authenticate_as(:'ben');
select public.assign_learner(:'lee', :'ivy');
reset role;
select is(pg_temp.queued(:'lee_link'), 1, 'giving a learner to an instructor queues them being told');
select is(
  (select jsonb_build_object('told', n -> 'recipients', 'learner', n ->> 'learner_name', 'id', n ->> 'learner_id', 'school', n ->> 'school_name')
     from public.system_school_notice('learner.assigned', :'lee_link') as n),
  jsonb_build_object('told', jsonb_build_array(jsonb_build_object('user_id', :'ivy_user', 'audience', 'instructor')),
                     'learner', 'Lee One', 'id', :'lee', 'school', 'Bee School'),
  'Ivy hears it, with who and where'
);

-- Given back to Ian before anybody read it: whoever has him now is told.
select tests.authenticate_as(:'ben');
select public.assign_learner(:'lee', :'ian');
reset role;
select is(
  (select r ->> 'user_id' from jsonb_array_elements(public.system_school_notice('learner.assigned', :'lee_link') -> 'recipients') r),
  :'ian_user',
  'and given to somebody else, it is that one'
);

-- Put on the list with nobody signed in, by a job or an import, it is nobody's news.
select tests.clear_authentication();
insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source)
values (:'school', :'liz', :'ivy', 'active', 'manual');
select id as liz_link from public.learner_relationships where business_id = :'school' and learner_id = :'liz' \gset
select is(pg_temp.queued(:'liz_link'), 0, 'a learner put on the list with nobody giving them is nobody''s news');

-- Who is giving whom. The function runs inside the database's own functions, so it is asked as them.
select tests.authenticate_as(:'ivy_user');
reset role;
select is(private.given_by_the_office(:'school', :'ivy'), false, 'an instructor putting a learner with themselves is not the office giving one');
select tests.authenticate_as(:'ben');
reset role;
select is(private.given_by_the_office(:'school', :'ivy'), true, 'the owner giving one is');
select is(private.given_by_the_office('aaaa0000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001'), false,
  'and nobody is given learners at a Business that is not a school');

select * from finish();
rollback;
