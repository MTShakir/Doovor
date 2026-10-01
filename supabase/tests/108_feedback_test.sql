-- Telling us something, and the people who read it (D-202).
begin;
select plan(23);

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
select public.submit_feedback('issue', '  The diary will not scroll on my phone.  ', array[:'asha' || '/one.webp'], '/app/instructor/diary') as answer \gset
select (:'answer'::jsonb) ->> 'id' as report \gset
select (:'answer'::jsonb) ->> 'reference' as reference \gset

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

-- ---------------------------------------------------------------------------------------
-- Every report is called something, and both ends of it are written to (D-241).
-- ---------------------------------------------------------------------------------------
-- The numbers themselves are not asserted, and that is deliberate: a sequence does not roll back,
-- so every run of this file leaves it further along and any absolute value here would pass once.
-- What is asserted is the shape, that each one follows the last, and that no two are the same.
-- That the very first is R01 is the migration's `setval` and the unit test beside the format.
select tests.clear_authentication();

select matches(:'reference'::text, '^R[0-9]{2,}$', 'a report is called R and a number, padded to two');
select is(
  (select reference from public.feedback_submissions where id = :'report'),
  :'reference'::text,
  'and that is what the row says too'
);

-- From a sequence rather than from counting rows, so two arriving at once cannot collide.
select tests.authenticate_as(:'ben');
select public.submit_feedback('feature', 'A dark mode would be nice') ->> 'reference' as second \gset
select tests.clear_authentication();

select is(
  (substring(:'second'::text from 2))::int,
  (substring(:'reference'::text from 2))::int + 1,
  'the next one carries on from the last'
);
select isnt(:'second'::text, :'reference'::text, 'and no two reports are called the same thing');

-- Asking for the confirmation is part of writing the row, so one cannot happen without the other.
select is(
  (select count(*)::int from public.outbox_events
    where name = 'feedback.submitted' and payload ->> 'feedback_id' = :'report'),
  1,
  'sending one asks for the email that confirms it'
);

-- Dealing with it tells them, once.
select tests.authenticate_as(:'staff', 'aal2');
select public.admin_handle_feedback(:'report', true);
select public.admin_handle_feedback(:'report', true);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.outbox_events
    where name = 'feedback.handled' and payload ->> 'feedback_id' = :'report'),
  1,
  'dealing with one asks for the email that says so, and pressing it twice does not'
);

-- Putting it back is staff correcting themselves, and is not news to anybody.
select tests.authenticate_as(:'staff', 'aal2');
select public.admin_handle_feedback(:'report', false);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.outbox_events
    where name = 'feedback.handled' and payload ->> 'feedback_id' = :'report'),
  1,
  'putting one back tells nobody anything'
);

-- Dealt with again after being put back: that is news again.
select tests.authenticate_as(:'staff', 'aal2');
select public.admin_handle_feedback(:'report', true);
-- Both reports were written in one transaction, so `now()` is the same for them and which is
-- "newest" is undecidable. What matters is that staff see the reference at all.
select is(
  (select count(*)::int
     from jsonb_array_elements(public.admin_feedback() -> 'rows') as shown
    where shown ->> 'reference' in (:'reference', :'second')),
  2,
  'staff see the reference on every report'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.outbox_events
    where name = 'feedback.handled' and payload ->> 'feedback_id' = :'report'),
  2,
  'but dealing with it again after that does'
);

-- What the confirmation emails read, which nobody signed in may.
select is(
  (public.system_feedback_for_email(:'report') ->> 'reference'),
  :'reference'::text,
  'the job can read what to write'
);
select tests.authenticate_as(:'asha');
select throws_ok(
  format($$ select public.system_feedback_for_email(%L) $$, :'report'),
  '42501',
  null,
  'and nobody signed in can read somebody else off it'
);
select tests.clear_authentication();

select * from finish();
rollback;
