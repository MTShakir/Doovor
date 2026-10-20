-- A learner accepting an invitation is news to the instructor who sent it, and their school
-- (NTF-03, LRN-03, PRD Appendix B, D-301).
begin;
select plan(11);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ben_user 'b0000000-0000-0000-0000-000000000001'
\set mia_user 'b0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set lou 'c0000000-0000-0000-0000-000000000002'

-- Ian, who teaches at the school, invites Liz by the name he knows her by, and somebody else who
-- never answers.
select tests.authenticate_as(:'ian_user');
select (public.invite_learner(:'ian', 'link', 'Elizabeth Three')).token as ian_token \gset
select (public.invite_learner(:'ian', 'link')).invitation_id as ian_unanswered \gset
select tests.clear_authentication();
select id as ian_invitation from public.invitations
 where token_hash = private.invitation_hash(:'ian_token') \gset

-- By invitation: a database an end to end run has been through holds news of its own.
select is(
  (select count(*)::int from public.outbox_events
    where name = 'learner.joined' and payload ->> 'invitation_id' = :'ian_invitation'),
  0,
  'an invitation sent is not news yet'
);

select tests.authenticate_as(:'liz');
select public.accept_invitation(:'ian_token');

select tests.clear_authentication();
select is(
  (select payload from public.outbox_events
    where name = 'learner.joined' and payload ->> 'invitation_id' = :'ian_invitation'),
  jsonb_build_object('invitation_id', :'ian_invitation'::uuid),
  'accepting it queues the news, naming the invitation and nothing about who'
);

select tests.authenticate_as(:'liz');
select throws_ok(
  format($$ select public.accept_invitation(%L) $$, :'ian_token'),
  'P0001', 'VALIDATION_FAILED',
  'a link works once'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.outbox_events
    where name = 'learner.joined' and payload ->> 'invitation_id' = :'ian_invitation'),
  1,
  'so the news is queued once'
);

-- What the job is told: who joined, who they joined, and the school's owner and manager.
select is(
  (select public.system_learner_joined_notice(:'ian_invitation') ->> 'learner_name'),
  'Liz Three',
  'the learner by the name they gave themselves, not the one on the invitation'
);
select is(
  (select public.system_learner_joined_notice(:'ian_invitation') ->> 'instructor_user_id'),
  :'ian_user',
  'the instructor the learner is now with hears'
);
select is(
  (select array(select jsonb_array_elements_text(public.system_learner_joined_notice(:'ian_invitation') -> 'school_staff_ids')
                 order by 1)),
  array[:'ben_user', :'mia_user'],
  'and so do the school''s owner and manager, without telling the instructor twice'
);
select is(
  public.system_learner_joined_notice(:'ian_unanswered'),
  null,
  'an invitation nobody has accepted is not news'
);

-- An independent instructor has nobody else to tell.
select tests.authenticate_as(:'asha_user');
select (public.invite_learner(:'asha', 'link')).token as asha_token \gset
select tests.authenticate_as(:'lou');
select public.accept_invitation(:'asha_token');
select tests.clear_authentication();
select id as asha_invitation from public.invitations
 where token_hash = private.invitation_hash(:'asha_token') \gset
select is(
  public.system_learner_joined_notice(:'asha_invitation') -> 'school_staff_ids',
  '[]'::jsonb,
  'an independent instructor''s own Business has nobody else to tell'
);

-- Only the job reads it.
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.system_learner_joined_notice(%L) $$, :'ian_invitation'),
  '42501', null,
  'nobody signed in can read who to tell'
);
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.system_learner_joined_notice(%L) $$, :'ian_invitation'),
  '42501', null,
  'and nor can a visitor'
);

select * from finish();
rollback;
