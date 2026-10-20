-- A learner accepting an invitation is told to whoever invited them and their school (NTF-03, D-297).
begin;
select plan(9);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set liz 'c0000000-0000-0000-0000-000000000003'

-- How many events wait to be sent about one invitation.
create function pg_temp.queued(p_invitation uuid)
returns integer
language sql
as $$
  select count(*)::int
    from public.outbox_events
   where name = 'learner.joined' and payload ->> 'invitation_id' = p_invitation::text;
$$;

-- Who a notice goes to, as "user audience" lines in order.
create function pg_temp.told(p_notice jsonb)
returns text[]
language sql
as $$
  select coalesce(array_agg((r ->> 'user_id') || ' ' || (r ->> 'audience') order by r ->> 'user_id'), '{}')
    from jsonb_array_elements(p_notice -> 'recipients') as r;
$$;

-- Asha, who teaches on her own, makes a link for Liz.
select tests.authenticate_as(:'asha_user');
select (public.invite_learner(:'asha', 'link')).token as asha_token \gset
reset role;
select id as asha_invite from public.invitations where token_hash = private.invitation_hash(:'asha_token') \gset
select is(pg_temp.queued(:'asha_invite'), 0, 'nothing is queued before the invitation is accepted');
select is(public.system_learner_joined_notice(:'asha_invite'), null, 'and there is nothing to tell');

select tests.authenticate_as(:'liz');
select public.accept_invitation(:'asha_token');
reset role;
select is(pg_temp.queued(:'asha_invite'), 1, 'accepting queues it, once');
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'learner', n ->> 'learner_name', 'learner_id', n ->> 'learner_id')
     from public.system_learner_joined_notice(:'asha_invite') as n),
  jsonb_build_object('told', array[:'asha_user' || ' instructor'], 'learner', 'Liz Three', 'learner_id', :'liz'),
  'to the owner of a Business of one, about the learner by name'
);

-- Ian, who teaches at Bee School, makes one too, and Liz accepts it.
select tests.authenticate_as(:'ian_user');
select (public.invite_learner(:'ian', 'link')).token as school_token \gset
reset role;
select id as school_invite from public.invitations where token_hash = private.invitation_hash(:'school_token') \gset
select tests.authenticate_as(:'liz');
select public.accept_invitation(:'school_token');
reset role;
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'instructor', n ->> 'instructor_name')
     from public.system_learner_joined_notice(:'school_invite') as n),
  jsonb_build_object('told', array[:'ben' || ' school', :'manager' || ' school', :'ian_user' || ' instructor'], 'instructor', 'Ian'),
  'at a school, to the instructor who invited them and to the people who run it'
);

-- Stamped again, it is not queued again; and a member joining is not this notice.
update public.invitations set accepted_at = now() where id = :'asha_invite';
select is(pg_temp.queued(:'asha_invite'), 1, 'an invitation stamped again is not told twice');

select tests.authenticate_as(:'ben');
select token as member_token from public.invite_member(:'school', 'instructor', 'link', 'Nia', null, null) \gset
reset role;
select id as member_invite from public.invitations where token_hash = private.invitation_hash(:'member_token') \gset
update public.invitations set accepted_at = now(), accepted_by = :'liz' where id = :'member_invite';
select is(pg_temp.queued(:'member_invite'), 0, 'somebody joining the team is not a learner joining');

-- Nothing about an account deleted since, and only the jobs read it.
update public.users set deleted_at = now() where id = :'liz';
select is(public.system_learner_joined_notice(:'asha_invite'), null, 'nothing about a learner whose account has gone');
select ok(
  not has_function_privilege('authenticated', 'public.system_learner_joined_notice(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.system_learner_joined_notice(uuid)', 'execute'),
  'only the jobs read it'
);

select * from finish();
rollback;
