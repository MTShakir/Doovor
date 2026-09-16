-- School onboarding: a school set up by its owner, and instructors invited to join it (AUTH-05, M5-11).
begin;
select plan(28);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set owner 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set outsider 'd0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'

-- A new school starts unfinished; a Business of one has nothing more to set up.
select tests.create_user_with_id('e0000000-0000-0000-0000-000000000001', 'sophie@test.local', 'Sophie Owner');
select tests.create_user_with_id('e0000000-0000-0000-0000-000000000002', 'nia@test.local', 'Nia Newcomer');
select tests.create_user_with_id('e0000000-0000-0000-0000-000000000003', 'omar@test.local', 'Omar Own');
select tests.authenticate_as('e0000000-0000-0000-0000-000000000001');
select public.create_business('school', 'Northern Lights Driving') as new_school \gset
select tests.clear_authentication();
select is((select onboarding_completed_at from public.businesses where id = :'new_school'), null, 'a new school is not set up yet');
select tests.authenticate_as('e0000000-0000-0000-0000-000000000003');
select public.create_business('independent', 'Omar Driving') as new_independent \gset
select tests.clear_authentication();
select isnt((select onboarding_completed_at from public.businesses where id = :'new_independent'), null, 'while a Business of one is');

-- The owner says what the school is.
select tests.authenticate_as(:'owner');
select lives_ok(
  format($$ update public.businesses set expected_instructors = 6, base_postcode = 'M1 1AE', onboarding_completed_at = now() where id = %L $$, :'school'),
  'the owner saves the school''s details and finishes setting it up'
);
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L) $$, 'businesses/' || :'school' || '/logo-abcdefgh.webp', :'owner'),
  'and uploads its logo into the school''s own folder'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L) $$, 'businesses/' || :'school' || '/logo-ijklmnop.webp', :'ian_user'),
  '42501', null, 'an instructor at the school may not'
);
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name, owner) values ('avatars', %L, %L) $$, 'businesses/not-a-business/logo-qrstuvwx.webp', :'ian_user'),
  '42501', null, 'nor may anybody write a folder that names no Business'
);

-- Inviting an instructor.
select tests.authenticate_as(:'owner');
select invitation_id as invited, token as invite_token
  from public.invite_member(:'school', 'instructor', 'sms', 'Nia Newcomer', null, '+447700900555') \gset
select tests.clear_authentication();
select results_eq(
  format($$ select kind, role::text, channel, phone, full_name, invited_by from public.invitations where id = %L $$, :'invited'),
  format($$ values ('member'::text, 'instructor'::text, 'sms'::text, '+447700900555'::text, 'Nia Newcomer'::text, %L::uuid) $$, :'owner'),
  'the owner invites an instructor to the school, by the number the invitation is for'
);
select isnt(
  (select token_hash from public.invitations where id = :'invited'),
  :'invite_token',
  'and only the token''s hash is kept'
);
select is(
  (select count(*)::int from public.audit_log where action = 'member.invited' and entity_id = :'invited'),
  1,
  'with an audit entry'
);

select tests.authenticate_as(:'manager');
select lives_ok(
  format($$ select public.invite_member(%L, 'instructor', 'link') $$, :'school'),
  'a manager may invite too'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.invite_member(%L, 'instructor', 'link') $$, :'school'),
  '42501', null, 'an instructor at the school may not'
);
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.invite_member(%L, 'instructor', 'link') $$, :'asha_biz'),
  '42501', null, 'nobody is invited to a Business of one'
);
select tests.authenticate_as(:'owner');
select throws_ok(
  format($$ select public.invite_member(%L, 'owner', 'link') $$, :'school'),
  'P0001', 'VALIDATION_FAILED', 'nor to own a school'
);
select throws_ok(
  format($$ select public.invite_member(%L, 'manager', 'link') $$, :'school'),
  'P0001', 'VALIDATION_FAILED', 'and managers wait until a school can say what they may do'
);

-- What the link says before anybody signs in.
select tests.authenticate_as_anon();
select results_eq(
  format($$ select instructor_name, business_name, full_name, expired, kind, role::text, already_member from public.invitation_details(%L) $$, :'invite_token'),
  $$ values ('Bee School'::text, 'Bee School'::text, 'Nia Newcomer'::text, false, 'member'::text, 'instructor'::text, false) $$,
  'the invitation names the school, the person it is for, and what they are invited to be'
);
select tests.authenticate_as(:'owner');
select is(
  (select already_member from public.invitation_details(:'invite_token')),
  true,
  'and tells somebody already at the school, who opened the link they sent, that it is not for them'
);

-- Somebody who teaches for another Business keeps to it: one account, one diary.
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.accept_member_invitation(%L) $$, :'invite_token'),
  'P0001', 'VALIDATION_FAILED', 'an instructor with a Business of their own cannot join a school on the same account'
);
select tests.clear_authentication();
select is((select accepted_at from public.invitations where id = :'invited'), null, 'and the invitation is still there for the right person');

-- Accepting it.
select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ select public.accept_invitation(%L) $$, :'invite_token'),
  '42501', null, 'a member invitation is not a learner''s to accept'
);
select is(public.accept_member_invitation(:'invite_token'), :'school'::uuid, 'the invited instructor joins the school');
select tests.clear_authentication();
select results_eq(
  format($$ select role::text, status::text from public.memberships where business_id = %L and user_id = 'e0000000-0000-0000-0000-000000000002' $$, :'school'),
  $$ values ('instructor'::text, 'active'::text) $$,
  'as an instructor there'
);
select results_eq(
  format($$ select display_name, public_slug is not null, onboarding_completed_at is null from public.instructor_profiles
             where business_id = %L and user_id = 'e0000000-0000-0000-0000-000000000002' $$, :'school'),
  $$ values ('Nia Newcomer'::text, true, true) $$,
  'with a profile at the school, under their own name, ready for them to set up'
);
select isnt((select accepted_at from public.invitations where id = :'invited'), null, 'and the invitation is used');

select tests.authenticate_as('e0000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ select public.accept_member_invitation(%L) $$, :'invite_token'),
  'P0001', 'VALIDATION_FAILED', 'a used invitation works once'
);

-- A manager invited to teach keeps being a manager, and gets a profile to teach from.
select tests.authenticate_as(:'owner');
select token as manager_token from public.invite_member(:'school', 'instructor', 'link') \gset
select tests.authenticate_as(:'manager');
select lives_ok(format($$ select public.accept_member_invitation(%L) $$, :'manager_token'), 'a manager accepts an invitation to teach');
select tests.clear_authentication();
select is(
  (select role::text from public.memberships where business_id = :'school' and user_id = :'manager'),
  'manager',
  'and is still a manager'
);

-- An invitation that ran out.
select tests.authenticate_as(:'owner');
select invitation_id as stale, token as stale_token from public.invite_member(:'school', 'instructor', 'link') \gset
select tests.clear_authentication();
update public.invitations set expires_at = now() - interval '1 minute' where id = :'stale';
select tests.authenticate_as(:'outsider');
select throws_ok(
  format($$ select public.accept_member_invitation(%L) $$, :'stale_token'),
  'P0001', 'VALIDATION_FAILED', 'an invitation that has run out cannot be used'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.memberships where business_id = :'school' and user_id = :'outsider'),
  0,
  'and nobody joins through it'
);

select * from finish();
rollback;
