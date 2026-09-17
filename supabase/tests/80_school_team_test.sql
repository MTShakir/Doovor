-- A school's team: switching members off and on, what they may do, and invitations (SCH-02, M5-13).
begin;
select plan(37);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set max 'e0000000-0000-0000-0000-000000000005'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- Ian is on the public site, with a lesson to come; the school has a price; and a second manager.
update public.instructor_profiles
   set verification_status = 'approved', verified_at = now(), public_slug = private.unique_slug('Ian', 'instructor_profiles')
 where id = :'ian';
select public_slug as ian_slug from public.instructor_profiles where id = :'ian' \gset
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence) values (:'school', :'lesson_type', 60, 4200);
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type', date_trunc('hour', now()) + interval '3 days', date_trunc('hour', now()) + interval '3 days 1 hour',
        0, 'confirmed', 'unpaid', 4200, 'instructor');
select tests.create_user_with_id(:'max', 'max.manager@test.local', 'Max Manager');
insert into public.memberships (business_id, user_id, role) values (:'school', :'max', 'manager');

select id as ian_membership from public.memberships where business_id = :'school' and user_id = :'ian_user' \gset
select id as ivy_membership from public.memberships where business_id = :'school' and user_id = :'ivy_user' \gset
select id as mia_membership from public.memberships where business_id = :'school' and user_id = :'mia' \gset
select id as max_membership from public.memberships where business_id = :'school' and user_id = :'max' \gset
select id as ben_membership from public.memberships where business_id = :'school' and user_id = :'ben' \gset

-- ---------------------------------------------------------------------------------------
-- Who is on the team.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select results_eq(
  format($$ select m ->> 'name', m ->> 'role', (m ->> 'active')::boolean, (m ->> 'lessons_to_come')::int
              from jsonb_array_elements(public.school_team(%L) -> 'members') as m $$, :'school'),
  $$ values ('Max Manager'::text, 'manager'::text, true, 0), ('Mia Manager'::text, 'manager'::text, true, 0),
            ('Ian'::text, 'instructor'::text, true, 1), ('Ivy'::text, 'instructor'::text, true, 0) $$,
  'the owner sees everybody at the school but themselves, with the lessons each has to come (SCH-02)'
);
select tests.authenticate_as(:'mia');
select lives_ok(format($$ select public.school_team(%L) $$, :'school'), 'so does a manager');
select tests.authenticate_as(:'ian_user');
select throws_ok(format($$ select public.school_team(%L) $$, :'school'), '42501', null, 'an instructor does not');

-- ---------------------------------------------------------------------------------------
-- What each may do.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'mia');
select lives_ok(
  format($$ select public.set_member_permission(%L, 'set_own_prices', true) $$, :'ian_membership'),
  'a manager lets an instructor set their own prices'
);
select tests.clear_authentication();
select is(
  (select permissions from public.memberships where id = :'ian_membership'),
  '{"set_own_prices": true}'::jsonb,
  'and it is kept on the membership'
);
select tests.authenticate_as(:'mia');
select throws_ok(
  format($$ select public.set_member_permission(%L, 'view_revenue', true) $$, :'max_membership'),
  '42501', null, 'but only the owner decides whether a manager sees revenue'
);
select throws_ok(
  format($$ select public.set_member_permission(%L, 'set_own_prices', true) $$, :'mia_membership'),
  '42501', null, 'and nobody changes what they may do themselves'
);
select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.set_member_permission(%L, 'view_revenue', true) $$, :'max_membership'),
  'the owner lets a manager see revenue'
);
select tests.authenticate_as(:'max');
select isnt(
  public.school_overview(:'school') -> 'revenue_month',
  'null'::jsonb,
  'which that manager now does (PRD 6.2)'
);
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_member_permission(%L, 'view_revenue', true) $$, :'ian_membership'),
  'P0001', 'VALIDATION_FAILED', 'each permission belongs to one role'
);
select throws_ok(
  format($$ select public.set_member_permission(%L, 'manage_billing', true) $$, :'mia_membership'),
  'P0001', 'VALIDATION_FAILED', 'and nothing else can be given this way'
);
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.set_member_permission(%L, 'set_own_prices', true) $$, :'ian_membership'),
  '42501', null, 'an instructor gives nobody anything'
);

-- ---------------------------------------------------------------------------------------
-- Switching an instructor off.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select ok((select count(*) from public.bookings where business_id = :'school') > 0, 'before: Ian sees the school''s lessons');
select tests.authenticate_as_anon();
select isnt(public.instructor_profile_page(:'ian_slug'), null, 'and anybody can see his profile');

select tests.authenticate_as(:'mia');
select lives_ok(format($$ select public.set_member_active(%L, false) $$, :'ian_membership'), 'a manager switches Ian off');
select tests.clear_authentication();
select results_eq(
  format($$ select m.status::text, p.public_slug is null from public.memberships m
              join public.instructor_profiles p on p.user_id = m.user_id and p.business_id = m.business_id
             where m.id = %L $$, :'ian_membership'),
  $$ values ('deactivated'::text, true) $$,
  'his membership is off and his public address withdrawn'
);
select is(
  (select count(*)::int from public.audit_log where action = 'membership.role_changed' and entity_id = :'ian_membership'),
  2,
  'both changes to his membership are in the audit log'
);

select tests.authenticate_as(:'ian_user');
select is((select count(*)::int from public.bookings where business_id = :'school'), 0, 'Ian no longer sees the school''s lessons');
select is((select count(*)::int from public.businesses where id = :'school'), 0, 'nor the school itself');
select is((select count(*)::int from public.instructor_profiles where business_id = :'school'), 0, 'nor anybody who teaches there');
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, now() + interval '5 days', 60) $$, :'ian', :'lee', :'lesson_type'),
  '42501', null, 'he books nothing in its diary'
);
select throws_ok(
  format($$ select public.set_working_hours(%L, array[1, 2]::smallint[], '09:00', '17:00') $$, :'ian'),
  '42501', null, 'and changes none of his hours there'
);

select tests.authenticate_as_anon();
select is(public.instructor_profile_page(:'ian_slug'), null, 'his profile is gone from the public site');

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.create_booking(%L, %L, %L, now() + interval '5 days', 60) $$, :'ian', :'lee', :'lesson_type'),
  'P0001', 'INSTRUCTOR_INACTIVE', 'nobody at the school can book him a new lesson'
);
select results_eq(
  format($$ select (m ->> 'active')::boolean, (m ->> 'lessons_to_come')::int
              from jsonb_array_elements(public.school_team(%L) -> 'members') as m
             where m ->> 'membership_id' = %L $$, :'school', :'ian_membership'),
  $$ values (false, 1) $$,
  'and the lesson he had booked stays in the school''s diary, to be given to somebody else'
);

-- ---------------------------------------------------------------------------------------
-- Who may switch whom.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'mia');
select throws_ok(format($$ select public.set_member_active(%L, false) $$, :'ben_membership'), 'P0001', 'VALIDATION_FAILED', 'nobody switches the owner off');
select throws_ok(format($$ select public.set_member_active(%L, false) $$, :'mia_membership'), 'P0001', 'VALIDATION_FAILED', 'nor themselves');
select throws_ok(format($$ select public.set_member_active(%L, false) $$, :'max_membership'), '42501', null, 'a manager does not switch another manager off');
select tests.authenticate_as(:'ivy_user');
select throws_ok(format($$ select public.set_member_active(%L, true) $$, :'ian_membership'), '42501', null, 'nor does an instructor switch anybody on');
select tests.authenticate_as(:'asha_user');
select throws_ok(format($$ select public.set_member_active(%L, true) $$, :'ian_membership'), '42501', null, 'nor anybody from another Business');

-- ---------------------------------------------------------------------------------------
-- Switching back on.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select lives_ok(format($$ select public.set_member_active(%L, true) $$, :'ian_membership'), 'the owner switches Ian back on');
select tests.authenticate_as(:'ian_user');
select ok(
  (select count(*) from public.bookings where business_id = :'school') > 0
    and (select public_slug from public.instructor_profiles where id = :'ian') is not null,
  'and he has the school''s lessons and a public address again'
);

-- Somebody who has started teaching elsewhere in the meantime stays off: one account, one diary (D-118).
select tests.authenticate_as(:'ben');
select public.set_member_active(:'ivy_membership', false);
select tests.authenticate_as(:'ivy_user');
select public.create_business('independent', 'Ivy Own Driving');
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_member_active(%L, true) $$, :'ivy_membership'),
  'P0001', 'VALIDATION_FAILED', 'an instructor now teaching for their own Business cannot be switched back on'
);

-- ---------------------------------------------------------------------------------------
-- Cancelling an invitation.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select invitation_id as invite, token as invite_token from public.invite_member(:'school', 'instructor', 'sms', 'Wrong Number', null, '+447700900777') \gset
select tests.authenticate_as(:'ivy_user');
select throws_ok(format($$ select public.revoke_member_invitation(%L) $$, :'invite'), '42501', null, 'an instructor cancels nobody''s invitation');
select tests.authenticate_as(:'mia');
select lives_ok(format($$ select public.revoke_member_invitation(%L) $$, :'invite'), 'a manager cancels one sent to the wrong number');
select tests.authenticate_as_anon();
select is((select expired from public.invitation_details(:'invite_token')), true, 'and the link stops working at once');
select tests.authenticate_as(:'max');
select throws_ok(
  format($$ select public.accept_member_invitation(%L) $$, :'invite_token'),
  'P0001', 'VALIDATION_FAILED', 'nobody can join through it'
);

select * from finish();
rollback;
