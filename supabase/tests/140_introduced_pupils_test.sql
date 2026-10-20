-- A pupil the school introduced keeps that on the relationship, and the school's fee for them falls
-- due once, with their first lesson (M9-19, M9-20, D-290).
begin;
select plan(13);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lara 'c0000000-0000-0000-0000-000000000071'
\set mo 'c0000000-0000-0000-0000-000000000072'

-- Asha is linked, at £20 for each pupil the school introduces. Lara asked the school and Asha
-- took her; Mo asked too, and the school gives him to Ian.
insert into public.school_links (school_id, business_id, pupil_fee_pence) values (:'school', :'asha_biz', 2000);
insert into public.school_enquiries (school_id, full_name, email, postcode, source, consent_wording, status, taken_business_id, taken_at)
values (:'school', 'Lara Pupil', 'lara@example.com', 'M1 1AE', 'public', 'I agree.', 'taken', :'asha_biz', now());
insert into public.school_enquiries (school_id, full_name, email, postcode, source, consent_wording)
values (:'school', 'Mo Pupil', 'mo@example.com', 'M1 1AE', 'office', 'They agreed.');
select id as lara_ask from public.school_enquiries where full_name = 'Lara Pupil' \gset
select id as mo_ask from public.school_enquiries where full_name = 'Mo Pupil' \gset
select tests.create_user_with_id(:'lara', 'lara@example.com', 'Lara Pupil');
select tests.create_user_with_id(:'mo', 'mo@example.com', 'Mo Pupil');
update auth.users set email_confirmed_at = null where id in (:'lara', :'mo');

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.add_enquiry_learner(%L, %L) $$, :'lara_ask', :'lara'),
  'NOT_FOUND',
  'the school cannot put a pupil on an instructor''s own list'
);

select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ select public.add_enquiry_learner(%L, %L) $$, :'lara_ask', :'lara'),
  'Asha puts the pupil she accepted on her own list'
);
reset role;
select is(
  (select array[r.introduced_by::text, r.instructor_id::text, e.taken_learner_id::text]
     from public.learner_relationships r, public.school_enquiries e
    where r.business_id = :'asha_biz' and r.learner_id = :'lara' and e.id = :'lara_ask'),
  array[:'school', :'asha', :'lara'],
  'as one the school introduced'
);
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.add_enquiry_learner(%L, %L) $$, :'lara_ask', :'mo'),
  'VALIDATION_FAILED',
  'once only'
);
select is(public.learner_introduced_by(:'lara'), 'Bee School', 'and she sees which school introduced her');
select is(public.learner_introduced_by(:'lee'), null, 'nothing for a learner of her own');

-- The fee falls due with the first lesson booked, once.
reset role;
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
values (:'asha_biz', :'asha', :'lara', 'a2000000-0000-0000-0000-000000000001',
        (private.today() + 3 + time '10:00') at time zone 'Europe/London',
        (private.today() + 3 + time '11:00') at time zone 'Europe/London', 30, 'confirmed', 4500, 'instructor');
select is(
  (select array[amount_pence::text, learner_name, (due_on = private.today())::text] from public.school_fees where kind = 'pupil' and learner_id = :'lara'),
  array['2000', 'Lara Pupil', 'true'],
  'the first lesson booked raises the fee for the pupil, due today'
);
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
values (:'asha_biz', :'asha', :'lara', 'a2000000-0000-0000-0000-000000000001',
        (private.today() + 5 + time '10:00') at time zone 'Europe/London',
        (private.today() + 5 + time '11:00') at time zone 'Europe/London', 30, 'confirmed', 4500, 'instructor');
select is((select count(*)::int from public.school_fees where kind = 'pupil'), 1, 'and the next lesson raises nothing more');
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
values (:'asha_biz', :'asha', :'lee', 'a2000000-0000-0000-0000-000000000001',
        (private.today() + 7 + time '10:00') at time zone 'Europe/London',
        (private.today() + 7 + time '11:00') at time zone 'Europe/London', 30, 'confirmed', 4500, 'instructor');
select is((select count(*)::int from public.school_fees where kind = 'pupil'), 1, 'a learner of her own raises no fee');

-- Given to the school's own instructor, a pupil is introduced by the school, and owes it no fee.
select tests.authenticate_as(:'ben');
select public.give_school_enquiry(:'mo_ask', :'ian', :'mo');
reset role;
select is(
  (select introduced_by::text from public.learner_relationships where business_id = :'school' and learner_id = :'mo'),
  :'school',
  'a pupil given to the school''s own instructor is the school''s introduction'
);
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'mo', 'b2000000-0000-0000-0000-000000000001',
        (private.today() + 3 + time '14:00') at time zone 'Europe/London',
        (private.today() + 3 + time '15:00') at time zone 'Europe/London', 30, 'confirmed', 4200, 'instructor');
select is((select count(*)::int from public.school_fees where kind = 'pupil'), 1, 'and raises no fee for a pupil');
select tests.authenticate_as(:'ben');
select is(public.learner_introduced_by(:'mo'), null, 'nor says the school introduced its own learner');

reset role;
select is(
  (select count(*)::int from public.audit_log where action = 'school.enquiry_learner_added' and entity_id = :'lara_ask'),
  1,
  'the pupil put on the list is written down'
);

select * from finish();
rollback;
