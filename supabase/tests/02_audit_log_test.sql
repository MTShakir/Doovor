-- Audit log (NFR-SEC-06, ADM-07): append-only, sign-ins and role changes recorded.
begin;
select plan(9);

select tests.create_user('owner@test.local', 'Owner') as owner_id \gset
select tests.create_user('super@test.local', 'Super') as super_id \gset

insert into public.businesses (id, type, name, slug)
values ('cccccccc-0000-0000-0000-000000000001', 'school', 'Audit School', 'audit-school');

insert into public.memberships (id, business_id, user_id, role)
values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', :'owner_id', 'manager');

select is(
  (select count(*)::int from public.audit_log
    where action = 'membership.created' and entity_id = 'dddddddd-0000-0000-0000-000000000001'),
  1,
  'creating a membership writes an audit row'
);

update public.memberships set role = 'owner' where id = 'dddddddd-0000-0000-0000-000000000001';
select results_eq(
  $$ select before ->> 'role', after ->> 'role' from public.audit_log
      where action = 'membership.role_changed' and entity_id = 'dddddddd-0000-0000-0000-000000000001' $$,
  $$ values ('manager', 'owner') $$,
  'a role change records before and after'
);

insert into auth.sessions (id, user_id, created_at, updated_at, aal, ip, user_agent)
values ('eeeeeeee-0000-0000-0000-000000000001', :'owner_id', now(), now(), 'aal1', '203.0.113.7', 'Test browser');
select results_eq(
  $$ select actor_user_id::text, host(ip), user_agent from public.audit_log where action = 'auth.sign_in' $$,
  format($$ values (%L, '203.0.113.7', 'Test browser') $$, :'owner_id'),
  'every sign-in is recorded with IP and user agent'
);

select throws_ok(
  $$ update public.audit_log set action = 'tampered.row' $$,
  '42501', 'audit_log is append-only',
  'audit rows cannot be changed, even by the table owner'
);
select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', 'audit_log is append-only',
  'audit rows cannot be deleted'
);
select throws_ok(
  $$ truncate public.audit_log $$,
  '42501', 'audit_log is append-only',
  'the audit log cannot be truncated'
);

insert into public.platform_staff (user_id, role) values (:'super_id', 'super_admin');

select tests.authenticate_as(:'owner_id');
select is_empty($$ select id from public.audit_log $$, 'business users cannot read the audit log');
select throws_ok(
  $$ insert into public.audit_log (actor_role, action, entity) values ('owner', 'fake.entry', 'x') $$,
  '42501', null,
  'nobody can write audit rows directly'
);

select tests.authenticate_as(:'super_id', 'aal2');
select ok((select count(*) from public.audit_log) >= 4, 'a Super Admin with TOTP can read the audit log');

select * from finish();
rollback;
