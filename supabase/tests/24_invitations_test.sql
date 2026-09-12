-- An invitation is a link, and only its hash is kept (AUTH-07, M2-03).
begin;
select plan(12);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set new_learner 'c0000000-0000-0000-0000-000000000003'

select tests.authenticate_as(:'asha_user');
select public.invite_learner(:'asha', 'whatsapp', 'Nina New', null, '+447700900123') as invited \gset
select (public.invite_learner(:'asha', 'link')).token as token \gset

select ok(:'token' ~ '^[A-Za-z0-9_-]{40,}$', 'the token is long and fits in a link without escaping');
select is(
  (select count(*)::int from public.invitations where token_hash = :'token'),
  0,
  'the token itself is never stored'
);
select is(
  (select count(*)::int from public.invitations where token_hash = private.invitation_hash(:'token')),
  1,
  'only its hash is'
);

-- What the landing page may say before anyone signs in.
select tests.authenticate_as_anon();
select is(
  (select instructor_name from public.invitation_details(:'token')),
  'Asha',
  'a visitor is told who invited them'
);
select is(
  (select expired from public.invitation_details(:'token')),
  false,
  'and that the link still works'
);
select is(
  (select count(*)::int from public.invitation_details('not-a-real-token')),
  0,
  'a token nobody issued says nothing at all'
);

-- Accepting links the learner to the instructor.
select tests.authenticate_as(:'new_learner');
select is(
  public.accept_invitation(:'token'),
  'aaaa0000-0000-0000-0000-000000000000'::uuid,
  'accepting says which business they have joined'
);
select is(
  (select instructor_id from public.learner_relationships
    where learner_id = :'new_learner' and business_id = 'aaaa0000-0000-0000-0000-000000000000'),
  :'asha'::uuid,
  'and the learner is linked to the instructor who invited them'
);
select throws_ok(
  format($$ select public.accept_invitation(%L) $$, :'token'),
  'P0001',
  'VALIDATION_FAILED',
  'a link works once'
);

-- Who may invite
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.invite_learner(%L, 'link') $$, :'asha'),
  '42501',
  'NOT_ALLOWED',
  'one instructor cannot invite learners as another'
);

-- Expiry
select tests.clear_authentication();
update public.invitations set expires_at = now() - interval '1 day' where accepted_at is null;
select tests.authenticate_as_anon();
select is(
  (select count(*)::int from public.invitation_details('')),
  0,
  'an empty token finds nothing'
);
select tests.authenticate_as(:'new_learner');
select throws_ok(
  format($$ select public.accept_invitation(%L) $$, 'expired-token-that-never-existed'),
  '42501',
  'NOT_FOUND',
  'and a token nobody issued cannot be accepted'
);

select * from finish();
rollback;
