-- Who sells a school's lessons: the school, its instructors or both, which only the owner says
-- (M9-04, D-281).
begin;
select plan(10);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'

select is(
  (select lesson_seller from public.businesses where id = :'school'),
  null,
  'a new school has said nothing yet, so nothing is chosen for it'
);

-- The owner says.
select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.set_lesson_seller(%L, 'both') $$, :'school'),
  'the owner says some lessons are the school''s and some its instructors'''
);
select is((select lesson_seller::text from public.businesses where id = :'school'), 'both', 'and it is kept');
select lives_ok(
  format($$ select public.set_lesson_seller(%L, 'both') $$, :'school'),
  'saying it again changes nothing'
);

-- Instructors still teaching under the school: it cannot be theirs alone yet.
select throws_ok(
  format($$ select public.set_lesson_seller(%L, 'instructors') $$, :'school'),
  'VALIDATION_FAILED',
  'while instructors teach under the school, its lessons are not only theirs to sell'
);

-- A manager does not say, and an instructor of one has no school to say it about.
select tests.authenticate_as(:'manager');
select throws_ok(
  format($$ select public.set_lesson_seller(%L, 'school') $$, :'school'),
  'NOT_ALLOWED',
  'a manager cannot change who sells the lessons: it is the owner''s to say'
);
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.set_lesson_seller(%L, 'school') $$, :'asha_biz'),
  'NOT_FOUND',
  'an instructor of one has no school lessons to say anything about'
);

-- Once nobody teaches under it, its instructors may sell every lesson.
select tests.clear_authentication();
update public.memberships set status = 'deactivated' where business_id = :'school' and role = 'instructor';
select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.set_lesson_seller(%L, 'instructors') $$, :'school'),
  'with nobody teaching under the school, its instructors sell their own lessons'
);
select tests.clear_authentication();

select is(
  (select count(*)::int from public.audit_log where action = 'school.lesson_seller_set' and business_id = :'school'),
  2,
  'each change is in the audit log, and the one that changed nothing is not'
);
select is(
  (select array_agg(after ->> 'lesson_seller' order by after ->> 'lesson_seller') from public.audit_log
    where action = 'school.lesson_seller_set' and business_id = :'school'),
  array['both', 'instructors'],
  'with what it became each time'
);

select * from finish();
rollback;
