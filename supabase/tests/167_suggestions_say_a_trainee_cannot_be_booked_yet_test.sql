-- Suggesting who teaches a learner says a trainee nobody supervises cannot be booked yet
-- (SCH-03, INS-04, R-18, D-356).
begin;
select plan(2);

select tests.create_fixture();

\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- Ivy teaches at the school, checked and in date, and is a trainee nobody supervises yet.
update public.instructor_profiles
   set verification_status = 'approved', verified_at = now(), badge_expiry = private.today() + 200, qualification = 'pdi'
 where id = :'ivy';

select is(
  (select i ->> 'badge' from jsonb_array_elements(private.learner_allocation_facts(:'school', :'lee', now()) -> 'instructors') as i
    where i ->> 'instructor_id' = :'ivy'),
  'unsupervised',
  'a trainee nobody supervises is said to be one, who cannot be booked'
);

update public.instructor_profiles set supervisor_business_id = :'school' where id = :'ivy';
select is(
  (select i ->> 'badge' from jsonb_array_elements(private.learner_allocation_facts(:'school', :'lee', now()) -> 'instructors') as i
    where i ->> 'instructor_id' = :'ivy'),
  'checked',
  'supervised, she is suggested as anybody checked is'
);

select * from finish();
rollback;
