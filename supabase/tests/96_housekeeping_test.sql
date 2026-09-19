-- Housekeeping: the audit trail keeps two years, a checked badge picture goes, and a deleted
-- person's pictures go with them (NFR-PRV-03, NFR-SEC-06, D-158).
begin;
select plan(15);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set business 'aaaa0000-0000-0000-0000-000000000000'
\set old_row 'e1000000-0000-0000-0000-000000000001'
\set recent_row 'e1000000-0000-0000-0000-000000000002'

-- ---------------------------------------------------------------------------------------
-- The audit trail: two years, and still append-only for everything younger.
-- ---------------------------------------------------------------------------------------
insert into public.audit_log (id, occurred_at, actor_role, action, entity) values
  (:'old_row', now() - interval '3 years', 'system', 'test.kept_too_long', 'test'),
  (:'recent_row', now() - interval '1 year', 'system', 'test.kept_long_enough', 'test');

select throws_ok(
  format($$ delete from public.audit_log where id = %L $$, :'old_row'),
  '42501', 'audit_log is append-only',
  'an old row still cannot simply be deleted'
);
select throws_ok(
  format($$ update public.audit_log set action = 'test.changed' where id = %L $$, :'recent_row'),
  '42501', 'audit_log is append-only',
  'nor can any row be changed'
);

-- Marked as pruning, as the prune marks itself, a row under two years old still stays.
select set_config('private.pruning_audit', 'on', true);
select throws_ok(
  format($$ delete from public.audit_log where id = %L $$, :'recent_row'),
  '42501', 'audit_log is append-only',
  'even while pruning, nothing under two years old can go'
);
select set_config('private.pruning_audit', 'off', true);

select cmp_ok((select public.system_prune_audit_log()), '>=', 1, 'the nightly prune removes what is over two years old');
select is((select count(*)::int from public.audit_log where id = :'old_row'), 0, 'the three year old row is gone');
select is((select count(*)::int from public.audit_log where id = :'recent_row'), 1, 'the one year old row stays');
select ok(
  exists (
    select 1 from public.audit_log
     where action = 'audit_log.pruned' and actor_role = 'system' and occurred_at > now() - interval '1 minute'
  ),
  'and the prune leaves a row saying that it happened'
);

-- Only the job runner may do either.
select tests.authenticate_as(:'asha_user');
select throws_ok($$ select public.system_prune_audit_log() $$, '42501', null, 'a signed-in person cannot prune the audit trail');
select throws_ok($$ select * from public.system_unreferenced_files() $$, '42501', null, 'nor ask which pictures are about to go');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- A badge picture stops being pointed to once it has been checked.
-- ---------------------------------------------------------------------------------------
select tests.create_user('staff.housekeeping@test.local', 'Sam Support') as staff \gset
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');

select tests.authenticate_as(:'asha_user');
select public.submit_verification(:'asha', 'adi', '416234', (private.today() + 400)::date, true, :'asha' || '/badge-photo-one.webp');
select tests.clear_authentication();
select is(
  (select badge_path from public.instructor_profiles where id = :'asha'),
  :'asha' || '/badge-photo-one.webp',
  'a badge waiting to be checked keeps its picture'
);

select tests.authenticate_as(:'staff', 'aal2');
select public.decide_verification(:'asha', true, null);
select tests.clear_authentication();
select is((select badge_path from public.instructor_profiles where id = :'asha'), null, 'once it is decided, the picture is no longer pointed to');

-- ---------------------------------------------------------------------------------------
-- What the nightly job is given: pictures nothing points to, a day on, in our own folders.
-- ---------------------------------------------------------------------------------------
update public.instructor_profiles set photo_path = :'asha' || '/photo-current.webp' where id = :'asha';
update public.businesses set logo_url = 'businesses/' || :'business' || '/logo-current.webp' where id = :'business';

insert into storage.objects (bucket_id, name, created_at) values
  ('badges', :'asha' || '/badge-photo-one.webp', now() - interval '10 years'),
  ('avatars', :'asha' || '/photo-replaced.webp', now() - interval '10 years'),
  ('avatars', :'asha' || '/photo-current.webp', now() - interval '10 years'),
  ('avatars', :'asha' || '/photo-just-uploaded.webp', now()),
  ('avatars', 'businesses/' || :'business' || '/logo-current.webp', now() - interval '10 years'),
  ('avatars', 'businesses/' || :'business' || '/logo-replaced.webp', now() - interval '10 years'),
  ('avatars', 'put-here-by-hand/somebody.webp', now() - interval '10 years');

-- Scoped to these files: an end to end run leaves pictures of its own in this database.
select set_eq(
  format(
    $$ select bucket || ':' || name from public.system_unreferenced_files()
        where name like %L or name like %L or name like 'put-here-by-hand/%%' $$,
    :'asha' || '/%', 'businesses/' || :'business' || '/%'
  ),
  array[
    'badges:' || :'asha' || '/badge-photo-one.webp',
    'avatars:' || :'asha' || '/photo-replaced.webp',
    'avatars:businesses/' || :'business' || '/logo-replaced.webp'
  ],
  'a checked badge, a replaced photo and a replaced logo, and nothing in use, nothing new, nothing outside our folders'
);

-- ---------------------------------------------------------------------------------------
-- A deleted person's pictures stop being pointed to: the badge as well as the photo.
-- ---------------------------------------------------------------------------------------
update public.instructor_profiles set badge_path = :'asha' || '/badge-photo-two.webp' where id = :'asha';
insert into storage.objects (bucket_id, name, created_at) values ('badges', :'asha' || '/badge-photo-two.webp', now() - interval '10 years');
select is(
  (select count(*)::int from public.system_unreferenced_files() where name in (:'asha' || '/photo-current.webp', :'asha' || '/badge-photo-two.webp')),
  0,
  'while the account is open, its photo and its badge are in use'
);

select public.system_erase_account(:'asha_user');
select ok(
  (select photo_path is null and badge_path is null from public.instructor_profiles where id = :'asha'),
  'erasing the account stops both being pointed to'
);
select is(
  (select count(*)::int from public.system_unreferenced_files() where name in (:'asha' || '/photo-current.webp', :'asha' || '/badge-photo-two.webp')),
  2,
  'so the nightly job removes them'
);

select * from finish();
rollback;
