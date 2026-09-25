-- Telling us something, and the people who read it (D-202).
begin;
select plan(12);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000009'

select tests.create_user_with_id(:'staff', 'sue.super@test.local', 'Sue Super');
insert into public.platform_staff (user_id, role) values (:'staff', 'super_admin');

-- ---------------------------------------------------------------------------------------
-- An instructor sends one.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');
select public.submit_feedback('issue', '  The diary will not scroll on my phone.  ', array[:'asha' || '/one.webp'], '/app/instructor/diary') as report \gset

select is(
  (select message from public.feedback_submissions where id = :'report'),
  'The diary will not scroll on my phone.',
  'what somebody sent is kept, trimmed'
);
select is(
  (select business_id from public.feedback_submissions where id = :'report'),
  :'asha_business'::uuid,
  'and where they were working, so it can be read next to what it is about'
);
select is(
  (select page from public.feedback_submissions where id = :'report'),
  '/app/instructor/diary',
  'and which screen they were on'
);

-- ---------------------------------------------------------------------------------------
-- What it refuses.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  $$ select public.submit_feedback('complaint', 'Something') $$,
  'P0001', 'VALIDATION_FAILED', 'a kind that is not one of the four is refused'
);
select throws_ok(
  $$ select public.submit_feedback('issue', '   ') $$,
  'P0001', 'VALIDATION_FAILED', 'and a report that says nothing'
);
select throws_ok(
  format($$ select public.submit_feedback('issue', 'Four pictures', array[%L, %L, %L, %L]) $$,
         :'asha' || '/a.webp', :'asha' || '/b.webp', :'asha' || '/c.webp', :'asha' || '/d.webp'),
  'P0001', 'VALIDATION_FAILED', 'and a fourth picture'
);
select throws_ok(
  format($$ select public.submit_feedback('issue', 'Not my picture', array[%L]) $$, :'ben' || '/theirs.webp'),
  'P0001', 'VALIDATION_FAILED', 'and a picture out of somebody else''s folder'
);

-- ---------------------------------------------------------------------------------------
-- Who reads it.
-- ---------------------------------------------------------------------------------------
select is((select count(*)::int from public.feedback_submissions), 1, 'somebody reads what they sent');
select tests.authenticate_as(:'ben');
select is((select count(*)::int from public.feedback_submissions), 0, 'and nobody reads what they did not');
select throws_ok(
  $$ select public.admin_feedback() $$,
  '42501', null, 'and an owner is not staff'
);

select tests.authenticate_as(:'staff', 'aal2');
select results_eq(
  $$ select (public.admin_feedback() -> 'rows' -> 0 ->> 'kind'),
            (public.admin_feedback() ->> 'new_count')::int $$,
  $$ values ('issue', 1) $$,
  'staff read all of it, and how much is still waiting'
);
select is(
  jsonb_array_length(public.admin_feedback('feature') -> 'rows'),
  0,
  'and can look at one kind at a time'
);

select tests.clear_authentication();
select * from finish();
rollback;
