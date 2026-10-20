-- Linked instructors: an instructor's own Business linked to a school that sends them pupils, one
-- school at a time, vouched for and on Pro while linked, and back to what it was afterwards (M9-05,
-- D-282).
begin;
select plan(26);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set other_school 'cccc0000-0000-0000-0000-000000000000'

-- ---------------------------------------------------------------------------------------
-- Only a school whose instructors sell their own lessons links them.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select * from public.invite_linked_instructor(%L, 'link', 'Asha') $$, :'school'),
  'VALIDATION_FAILED',
  'a school that has not said its instructors sell their own lessons links nobody'
);
select public.set_lesson_seller(:'school', 'both');
select token as link_token from public.invite_linked_instructor(:'school', 'link', 'Asha') \gset
select is(length(:'link_token') > 30, true, 'once it has, the owner has a link to send');

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select * from public.invite_linked_instructor(%L, 'link', 'Someone') $$, :'school'),
  'NOT_ALLOWED',
  'an instructor at the school does not invite anybody'
);

-- ---------------------------------------------------------------------------------------
-- Accepting: what is linked is the Business they run on their own.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'otto');
select throws_ok(
  format($$ select public.accept_link_invitation(%L) $$, :'link_token'),
  'VALIDATION_FAILED',
  'somebody with no Business of their own has nothing to link yet'
);

select tests.authenticate_as(:'asha_user');
select is(
  (select expired or already_member from public.invitation_details(:'link_token')),
  false,
  'Asha reads an invitation still open, not yet hers'
);
select public.accept_link_invitation(:'link_token') as link_id \gset
select tests.clear_authentication();

select results_eq(
  format($$ select school_id, business_id, status::text from public.school_links where id = %L $$, :'link_id'),
  format($$ values (%L::uuid, %L::uuid, 'active'::text) $$, :'school', :'asha_biz'),
  'her own Business is linked to the school'
);
select results_eq(
  format($$ select plan::text, plan_expires_at is null from public.businesses where id = %L $$, :'asha_biz'),
  $$ values ('pro'::text, true) $$,
  'with Pro while it is, the school''s seat paying for it (D-279)'
);
select results_eq(
  format($$ select pro_given, prior_plan::text from public.school_links where id = %L $$, :'link_id'),
  $$ values (true, 'free'::text) $$,
  'and what it had before kept, to go back to'
);
select results_eq(
  format($$ select verification_status::text, vouched_at is not null from public.instructor_profiles where id = %L $$, :'asha'),
  $$ values ('approved'::text, true) $$,
  'the school vouches for her badge while she is linked (D-280)'
);

select tests.authenticate_as(:'asha_user');
select is(
  (select expired and already_member from public.invitation_details(:'link_token')),
  true,
  'reading the invitation again, it is used, and hers'
);
select throws_ok(
  format($$ select public.accept_link_invitation(%L) $$, :'link_token'),
  'VALIDATION_FAILED',
  'a used invitation links nothing again'
);
select is(
  (public.school_link_of(:'asha_biz') ->> 'schoolName'),
  'Bee School',
  'Asha sees which school she is linked to'
);
select is(
  public.submit_verification(:'asha', 'adi', '111 222', (private.today() + 300)::date, true),
  'approved'::public.verification_status,
  'and keeps her badge''s details without a photo, as the school''s own do'
);

-- ---------------------------------------------------------------------------------------
-- Who reads the link.
-- ---------------------------------------------------------------------------------------
select is((select count(*)::int from public.school_links), 1, 'Asha reads her own link');
select tests.authenticate_as(:'manager');
select is((select count(*)::int from public.school_links), 1, 'and so does a manager at the school');
select is(
  (public.school_team(:'school') -> 'linked' -> 0 ->> 'business_name'),
  'Asha Driving',
  'whose team lists her by the Business she runs, beside the school''s own instructors'
);
select tests.authenticate_as(:'ian_user');
select is((select count(*)::int from public.school_links), 0, 'an instructor at the school does not');
select tests.authenticate_as(:'otto');
select is((select count(*)::int from public.school_links), 0, 'nor does anybody else');

-- A school with linked instructors does not sell every lesson itself.
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_lesson_seller(%L, 'school') $$, :'school'),
  'VALIDATION_FAILED',
  'while an instructor is linked, the school does not sell all its lessons itself'
);

-- ---------------------------------------------------------------------------------------
-- One school at a time.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
insert into public.businesses (id, type, name, slug, lesson_seller)
values (:'other_school', 'school', 'Cee School', 'cee-school', 'instructors');
insert into public.memberships (business_id, user_id, role) values (:'other_school', :'otto', 'owner');
select tests.authenticate_as(:'otto');
select token as other_token from public.invite_linked_instructor(:'other_school', 'link', 'Asha') \gset
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.accept_link_invitation(%L) $$, :'other_token'),
  'VALIDATION_FAILED',
  'a Business linked to one school is not linked to another as well'
);

-- ---------------------------------------------------------------------------------------
-- Ending it: the school cannot be ended by somebody it is not theirs to end.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'otto');
select throws_ok(
  format($$ select public.end_school_link(%L) $$, :'link_id'),
  'NOT_ALLOWED',
  'another school cannot end the link'
);
select tests.authenticate_as(:'asha_user');
select lives_ok(format($$ select public.end_school_link(%L) $$, :'link_id'), 'Asha leaves the school');
select tests.clear_authentication();

select results_eq(
  format($$ select status::text, end_reason from public.school_links where id = %L $$, :'link_id'),
  $$ values ('ended'::text, 'left'::text) $$,
  'the link has ended, because she left'
);
select results_eq(
  format($$ select verification_status::text, vouched_at is null from public.instructor_profiles where id = %L $$, :'asha'),
  $$ values ('unsubmitted'::text, true) $$,
  'the school no longer vouches for her, so the platform checks her badge again'
);
select results_eq(
  format($$ select plan::text from public.businesses where id = %L $$, :'asha_biz'),
  $$ values ('free'::text) $$,
  'and her Business is back on the plan it had'
);
select is(
  (select array_agg(action order by action) from public.audit_log
    where action in ('school.link_invited', 'school.instructor_linked', 'school.link_ended') and business_id = :'school'),
  array['school.instructor_linked', 'school.link_ended', 'school.link_invited'],
  'the invitation, the link and its end are all in the school''s audit log'
);

select * from finish();
rollback;
