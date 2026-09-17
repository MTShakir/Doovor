-- The audit log viewer: every kind NFR-SEC-06 names can be found, by kind, person, Business and
-- day, and paged back through; only platform staff read it (ADM-07, M5-22).
begin;
select plan(21);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set staff 'e0000000-0000-0000-0000-000000000070'

select tests.create_user_with_id(:'staff', 'staff.audit@test.local', 'Sue Staff');
insert into public.platform_staff (user_id, role) values (:'staff', 'super_admin');

-- One of every kind NFR-SEC-06 names, as the functions that do these things write them.
select private.write_audit('auth.sign_in', 'session', gen_random_uuid(), null, null, jsonb_build_object('aal', 'aal1'), :'lee', 'user');
select private.write_audit('membership.role_changed', 'membership', gen_random_uuid(), :'school', jsonb_build_object('role', 'instructor'), jsonb_build_object('role', 'manager'), :'ben', 'owner');
select private.write_audit('instructor.verification_decided', 'instructor_profile', :'ivy', :'school', null, jsonb_build_object('approved', true), :'staff', 'super_admin');
select private.write_audit('refund.issued', 'refund', gen_random_uuid(), :'school', null, jsonb_build_object('amount_pence', 4200), :'ben', 'owner');
select private.write_audit('business.payments_connected', 'business', :'school', :'school', null, jsonb_build_object('account', 'acct_1'), :'ben', 'owner');
select private.write_audit('account.data_exported', 'user', :'lee', null, null, jsonb_build_object('format', 'json'), :'lee', 'user');
select private.write_audit('account.deletion_requested', 'user', :'lou', null, null, null, :'lou', 'user');
select private.write_audit('impersonation.started', 'user', :'lee', null, null, jsonb_build_object('reason', 'Missing lesson'), :'staff', 'super_admin');
-- And something about a learner's standing at the school, which names her through its link.
select private.write_audit('learner.status_changed', 'learner_relationship',
  (select id from public.learner_relationships where learner_id = :'lou' and business_id = :'school'), :'school',
  jsonb_build_object('status', 'active'), jsonb_build_object('status', 'paused'), :'ben', 'owner');

-- The rows this test wrote, as the viewer finds them: everything done by or about the test's people.
create function pg_temp.found(p_actions text[], p_person text default '@test.local', p_business text default null, p_from date default null)
returns table (action text) language sql as $$
  select l.action from public.admin_audit_log(p_actions, p_person, p_business, p_from) as l order by l.action;
$$;

select tests.authenticate_as(:'staff', 'aal2');
select results_eq($$ select * from pg_temp.found(array['auth.sign_in', 'auth.session_revoked']) $$, $$ values ('auth.sign_in') $$, 'sign-ins are found (NFR-SEC-06)');
select results_eq($$ select * from pg_temp.found(array['membership.role_changed']) $$, $$ values ('membership.role_changed') $$, 'role changes are found');
select results_eq($$ select * from pg_temp.found(array['instructor.verification_decided']) $$, $$ values ('instructor.verification_decided') $$, 'verification decisions are found');
select results_eq($$ select * from pg_temp.found(array['refund.issued']) $$, $$ values ('refund.issued') $$, 'refunds are found');
select results_eq($$ select * from pg_temp.found(array['business.payments_connected']) $$, $$ values ('business.payments_connected') $$, 'payout changes are found');
select results_eq($$ select * from pg_temp.found(array['account.data_exported']) $$, $$ values ('account.data_exported') $$, 'data exports are found');
select results_eq($$ select * from pg_temp.found(array['account.deletion_requested']) $$, $$ values ('account.deletion_requested') $$, 'account deletions are found');
select results_eq($$ select * from pg_temp.found(array['impersonation.started', 'impersonation.ended']) $$, $$ values ('impersonation.started') $$, 'and viewing as somebody is found');

select results_eq(
  $$ select l.action, l.actor_name, l.actor_role, l.about_name, l.business_name, l.after ->> 'reason'
       from public.admin_audit_log(array['impersonation.started'], 'Lee One') as l $$,
  $$ values ('impersonation.started', 'Sue Staff', 'super_admin', 'Lee One', null::text, 'Missing lesson') $$,
  'each says who did it, in what role, whom it was about and what changed'
);
select results_eq(
  $$ select action from public.admin_audit_log(null, 'learner.1@test') order by action $$,
  $$ values ('account.data_exported'), ('auth.sign_in'), ('impersonation.started') $$,
  'staff find everything done by a person or about them, by their email'
);
select results_eq(
  $$ select action from public.admin_audit_log(null, null, 'Bee Sch') order by action $$,
  $$ values ('business.payments_connected'), ('instructor.verification_decided'), ('learner.status_changed'), ('membership.created'),
            ('membership.created'), ('membership.created'), ('membership.created'), ('membership.role_changed'), ('refund.issued') $$,
  'and everything at a Business, by its name, joining it included'
);
select results_eq(
  $$ select about_name from public.admin_audit_log(array['membership.created'], null, 'Bee Sch') order by about_name $$,
  $$ values ('Ben Owner'), ('Ian One'), ('Ivy Two'), ('Mia Manager') $$,
  'naming whom a membership is for'
);
select results_eq(
  $$ select action, about_name from public.admin_audit_log(array['instructor.verification_decided', 'learner.status_changed'], null, 'Bee Sch') order by action $$,
  $$ values ('instructor.verification_decided', 'Ivy Two'), ('learner.status_changed', 'Lou Two') $$,
  'and whom a check of a badge, or a learner''s standing, was about'
);
select is(
  (select count(*)::int from pg_temp.found(null, 'learner.1@test', null, (now() at time zone 'Europe/London')::date + 1)),
  0,
  'a day after today finds nothing from today'
);
select is(
  (select count(*)::int from pg_temp.found(null, 'learner.1@test', null, (now() at time zone 'Europe/London')::date)),
  3,
  'and today finds all three of his, days being London days'
);

-- Paging back: the first three, then the next three from where those stopped, with none twice.
select l.occurred_at as last_at, l.id as last_id
  from public.admin_audit_log(null, '@test.local', null, null, null, null, null, 3) as l
 order by l.occurred_at, l.id limit 1 \gset
select is(
  (select count(*)::int from public.admin_audit_log(null, '@test.local', null, null, null, :'last_at', :'last_id', 3)),
  3,
  'the next page carries on from the last row of the one before'
);
select is(
  (select count(*)::int from (
     select id from public.admin_audit_log(null, '@test.local', null, null, null, null, null, 3)
     intersect
     select id from public.admin_audit_log(null, '@test.local', null, null, null, :'last_at', :'last_id', 3)
   ) as both_pages),
  0,
  'with nothing on both'
);
select throws_ok(
  format($$ select * from public.admin_audit_log(null, null, null, null, null, %L) $$, :'last_at'),
  'P0001', 'VALIDATION_FAILED', 'a page is asked for by the moment and the row together'
);

select tests.authenticate_as(:'staff');
select throws_ok($$ select * from public.admin_audit_log() $$, '42501', null, 'staff read nothing before their second step (AUTH-08)');
select tests.authenticate_as(:'ben', 'aal2');
select throws_ok($$ select * from public.admin_audit_log() $$, '42501', null, 'and the owner of a school reads nothing through it');
select tests.authenticate_as(:'lee');
select is((select count(*)::int from public.audit_log), 0, 'nor does anybody read the audit log straight from the table');

select * from finish();
rollback;
