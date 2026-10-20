-- The owner of a school invites a manager, who helps run it and sees its revenue only when the
-- owner allows (M9-26, D-293).
begin;
select plan(8);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set maya 'e0000000-0000-0000-0000-000000000143'

select tests.authenticate_as(:'ben');
select token as maya_token from public.invite_member(:'school', 'manager', 'link', 'Maya Manager', null, null) \gset
select is(
  (select array[kind, role::text] from public.invitations where token_hash = private.invitation_hash(:'maya_token')),
  array['member', 'manager'],
  'the owner invites a manager'
);

select tests.authenticate_as(:'manager');
select throws_ok(
  format($$ select public.invite_member(%L, 'manager', 'link') $$, :'school'),
  'NOT_ALLOWED',
  'a manager does not invite another'
);
select lives_ok(
  format($$ select public.invite_member(%L, 'instructor', 'link') $$, :'school'),
  'and still invites instructors'
);

-- Maya joins as a manager.
reset role;
select tests.create_user_with_id(:'maya', 'maya@test.local', 'Maya Manager');
select tests.authenticate_as(:'maya');
select is(public.accept_member_invitation(:'maya_token'), :'school'::uuid, 'Maya joins the school');
reset role;
select is(
  (select array[role::text, status::text] from public.memberships where business_id = :'school' and user_id = :'maya'),
  array['manager', 'active'],
  'as a manager'
);
select is(
  (select count(*)::int from public.instructor_profiles where business_id = :'school' and user_id = :'maya'),
  0,
  'with no instructor profile: a manager does not teach there'
);
select tests.authenticate_as(:'maya');
select is(
  array[private.auth_has_permission(:'school', 'manage_members'), private.auth_has_permission(:'school', 'set_prices'),
        private.auth_has_permission(:'school', 'view_revenue')],
  array[true, true, false],
  'who manages its instructors and prices, and sees revenue only when the owner allows'
);

reset role;
select is(
  (select count(*)::int from public.audit_log where action = 'member.invited' and business_id = :'school' and after ->> 'role' = 'manager'),
  1,
  'the invitation is written down'
);

select * from finish();
rollback;
