-- A number of their own for everybody on the platform (ADM-02, D-176).
begin;
select plan(9);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000030'
\set newcomer 'e0000000-0000-0000-0000-000000000031'
\set returner 'e0000000-0000-0000-0000-000000000032'

-- ---------------------------------------------------------------------------------------
-- Everybody has one, and nobody shares one.
-- ---------------------------------------------------------------------------------------
select is(
  (select count(*)::int from public.users where platform_number is null),
  0,
  'everybody already here was given a number'
);
select is(
  (select count(*)::int from (select platform_number from public.users group by platform_number having count(*) > 1) as shared),
  0,
  'and nobody shares one'
);
select ok(
  (select min(platform_number) from public.users) >= 1,
  'the counting starts at one, so D000000 belongs to nobody'
);

-- ---------------------------------------------------------------------------------------
-- A new account takes the next number, and a number is never given again.
-- ---------------------------------------------------------------------------------------
select (max(platform_number))::text as highest from public.users \gset
select tests.create_user_with_id(:'newcomer', 'newcomer@test.local', 'Nina New');
select is(
  (select platform_number from public.users where id = :'newcomer'),
  (:'highest')::bigint + 1,
  'somebody new takes the next number'
);

-- They leave for good, then come back: a new account, and never the number they had.
delete from auth.users where id = :'newcomer';
select tests.create_user_with_id(:'returner', 'newcomer.again@test.local', 'Nina Again');
select is(
  (select platform_number from public.users where id = :'returner'),
  (:'highest')::bigint + 2,
  'and coming back after leaving is a new number, never the old one'
);

-- ---------------------------------------------------------------------------------------
-- Staff find somebody by it, however it is typed.
-- ---------------------------------------------------------------------------------------
select platform_number as lee_number from public.users where id = :'lee' \gset
select tests.create_user_with_id(:'staff', 'support.ids@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');
select tests.authenticate_as(:'staff', 'aal2');

select is(
  (select count(*)::int from public.admin_learners('D' || lpad((:'lee_number')::text, 6, '0'))),
  1,
  'a learner is found by their ID'
);
select is(
  (select count(*)::int from public.admin_learners((:'lee_number')::text)),
  1,
  'or by the number alone'
);
select is(
  (select (public.admin_person(:'lee') ->> 'platform_number')::bigint),
  (:'lee_number')::bigint,
  'and their card carries it'
);
select is(
  (select count(*)::int from public.admin_learners('D999999999')),
  0,
  'a number nobody has finds nobody'
);

select * from finish();
rollback;
