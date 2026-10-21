-- The team says how many learners each member teaches, switched off or not (SCH-02, D-317).
begin;
select plan(2);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'

create function pg_temp.learners_of(p_name text)
returns integer language sql as $$
  select (m ->> 'learners')::integer
    from jsonb_array_elements(public.school_team('bbbb0000-0000-0000-0000-000000000000') -> 'members') m
   where m ->> 'name' = p_name;
$$;

-- Ian teaches Lee, and is switched off.
update public.memberships set status = 'deactivated' where business_id = :'school' and user_id = 'b0000000-0000-0000-0000-000000000003';
-- Ivy taught Lou, who has left.
update public.learner_relationships set status = 'left' where business_id = :'school' and learner_id = 'c0000000-0000-0000-0000-000000000002';

select tests.authenticate_as(:'ben');
select is(pg_temp.learners_of('Ian'), 1, 'a switched-off instructor still has the learner who stays with them');
select is(pg_temp.learners_of('Ivy'), 0, 'and somebody who has left is nobody''s learner');
reset role;

select * from finish();
rollback;
