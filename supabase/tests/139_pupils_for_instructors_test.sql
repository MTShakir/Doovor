-- A new pupil offered to linked instructors, the first to accept getting them, offers lapsing and
-- withdrawn, and a pupil given to one of the school's own instructors (M9-17, M9-18, D-289).
begin;
select plan(26);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set bo_user 'e0000000-0000-0000-0000-000000000001'
\set bo_biz 'eeee0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set consent 'I agree to Bee School keeping these details and passing them to one of its instructors.'

-- Bo runs a business of his own too, and both his and Asha's are linked to Bee School.
select tests.create_user_with_id(:'bo_user', 'bo@test.local', 'Bo Second');
insert into public.businesses (id, type, name, slug) values (:'bo_biz', 'independent', 'Bo Driving', 'bo-driving');
insert into public.memberships (business_id, user_id, role) values (:'bo_biz', :'bo_user', 'owner');
insert into public.instructor_profiles (user_id, business_id, display_name) values (:'bo_user', :'bo_biz', 'Bo');
insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz'), (:'school', :'bo_biz');
select id as asha_link from public.school_links where business_id = :'asha_biz' \gset
select id as bo_link from public.school_links where business_id = :'bo_biz' \gset

-- Six people asked.
insert into public.school_enquiries (school_id, full_name, email, phone, postcode, transmission, note, source, consent_wording)
select :'school', 'Pupil ' || n || ' Surname', 'pupil' || n || '@example.com', null, 'M1 1AE', 'manual', 'Evenings', 'public', :'consent'
  from generate_series(1, 6) as n;
select id as one from public.school_enquiries where full_name = 'Pupil 1 Surname' \gset
select id as two from public.school_enquiries where full_name = 'Pupil 2 Surname' \gset
select id as three from public.school_enquiries where full_name = 'Pupil 3 Surname' \gset
select id as four from public.school_enquiries where full_name = 'Pupil 4 Surname' \gset
select id as five from public.school_enquiries where full_name = 'Pupil 5 Surname' \gset
select id as six from public.school_enquiries where full_name = 'Pupil 6 Surname' \gset

-- Offered to both for a day.
select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.offer_school_enquiry(%L, array[%L, %L]::uuid[], 24) $$, :'one', :'asha_link', :'bo_link'),
  'the owner offers a pupil to two linked instructors'
);
select is(
  (select array[(select status::text from public.school_enquiries where id = :'one'),
                (select count(*)::text from public.school_enquiry_offers where enquiry_id = :'one' and status = 'open')]),
  array['offered', '2'],
  'the pupil is offered, with an offer open to each'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.offer_school_enquiry(%L, array[%L]::uuid[]) $$, :'two', :'asha_link'),
  'NOT_ALLOWED',
  'an instructor at the school does not offer pupils'
);

-- Before she accepts, Asha sees a first name, a district, a gearbox and when suits.
select tests.authenticate_as(:'asha_user');
select is(
  (select jsonb_build_object('first', x ->> 'firstName', 'district', x ->> 'district', 'full', x -> 'fullName', 'email', x -> 'email')
     from jsonb_array_elements(public.pupil_offers_for(:'asha_biz')) as x),
  '{"first": "Pupil", "district": "M1", "full": null, "email": null}'::jsonb,
  'an offer says who in outline, not who exactly'
);
select is((select count(*)::int from public.school_enquiries), 0, 'and the school''s inbox stays the school''s');
select tests.authenticate_as(:'bo_user');
select throws_ok(
  format($$ select public.answer_enquiry_offer((select id from public.school_enquiry_offers where enquiry_id = %L and business_id = %L), true) $$,
         :'one', :'asha_biz'),
  'NOT_FOUND',
  'nobody answers an offer made to somebody else'
);

-- Both say yes; Asha was first.
select tests.authenticate_as(:'asha_user');
select lives_ok(
  format($$ select public.answer_enquiry_offer((select o.id from public.school_enquiry_offers o where o.enquiry_id = %L and o.business_id = %L), true) $$,
         :'one', :'asha_biz'),
  'Asha accepts'
);
select tests.authenticate_as(:'bo_user');
select throws_ok(
  format($$ select public.answer_enquiry_offer((select o.id from public.school_enquiry_offers o where o.enquiry_id = %L and o.business_id = %L), true) $$,
         :'one', :'bo_biz'),
  'VALIDATION_FAILED',
  'and Bo, a moment later, does not get them'
);
reset role;
select is(
  (select array[e.status::text, e.taken_business_id::text,
                (select status::text from public.school_enquiry_offers where enquiry_id = e.id and business_id = :'bo_biz')]
     from public.school_enquiries e where e.id = :'one'),
  array['taken', :'asha_biz', 'withdrawn'],
  'the pupil is Asha''s, and Bo''s offer withdrawn'
);
select tests.authenticate_as(:'asha_user');
select is(
  (select jsonb_build_object('full', x ->> 'fullName', 'email', x ->> 'email', 'postcode', x ->> 'postcode', 'added', x -> 'learnerAdded')
     from jsonb_array_elements(public.pupil_offers_for(:'asha_biz')) as x),
  '{"full": "Pupil 1 Surname", "email": "pupil1@example.com", "postcode": "M1 1AE", "added": false}'::jsonb,
  'once she accepts, she sees who they are and how to reach them'
);

-- Declined, the pupil goes back to New.
select tests.authenticate_as(:'ben');
select public.offer_school_enquiry(:'two', array[:'bo_link']::uuid[]);
select tests.authenticate_as(:'bo_user');
select lives_ok(
  format($$ select public.answer_enquiry_offer((select o.id from public.school_enquiry_offers o where o.enquiry_id = %L), false) $$, :'two'),
  'Bo declines a pupil'
);
reset role;
select is((select status::text from public.school_enquiries where id = :'two'), 'new', 'who goes back to New');

-- Unanswered, an offer lapses.
select tests.authenticate_as(:'ben');
select public.offer_school_enquiry(:'three', array[:'bo_link']::uuid[], 1);
reset role;
update public.school_enquiry_offers set expires_at = now() - interval '1 minute' where enquiry_id = :'three';
select is(public.system_lapse_enquiry_offers(), 1, 'an offer nobody answered lapses');
select is((select status::text from public.school_enquiries where id = :'three'), 'new', 'and the pupil goes back to New');
select tests.authenticate_as(:'bo_user');
select throws_ok(
  format($$ select public.answer_enquiry_offer((select o.id from public.school_enquiry_offers o where o.enquiry_id = %L), true) $$, :'three'),
  'VALIDATION_FAILED',
  'it cannot be accepted afterwards'
);

-- An instructor who is no longer linked has nothing open; a closed enquiry has nothing open.
select tests.authenticate_as(:'ben');
select public.offer_school_enquiry(:'four', array[:'bo_link']::uuid[]);
select public.offer_school_enquiry(:'five', array[:'asha_link']::uuid[]);
select public.close_school_enquiry(:'five', 'Found somebody');
reset role;
update public.school_links set status = 'ended', ended_at = now(), end_reason = 'left', ended_by = :'bo_user' where id = :'bo_link';
select is(
  (select array_agg(e.status::text || ':' || o.status::text order by e.full_name)
     from public.school_enquiries e join public.school_enquiry_offers o on o.enquiry_id = e.id
    where e.id in (:'four', :'five')),
  array['new:withdrawn', 'closed:withdrawn'],
  'offers are withdrawn when the instructor leaves or the enquiry is closed'
);
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.offer_school_enquiry(%L, array[%L]::uuid[]) $$, :'four', :'bo_link'),
  'VALIDATION_FAILED',
  'and nobody is offered to an instructor no longer linked'
);
select throws_ok(
  format($$ select public.offer_school_enquiry(%L, array[%L]::uuid[], 200) $$, :'four', :'asha_link'),
  'VALIDATION_FAILED',
  'nor for more than a week'
);

-- Given to one of the school's own instructors, with the suggestions made for any learner.
select is(
  (select array_agg(x ->> 'name' order by x ->> 'name') from jsonb_array_elements(public.enquiry_allocation(:'six') -> 'instructors') as x),
  array['Ian', 'Ivy'],
  'the school sees who of its own could teach them'
);
select is(public.enquiry_allocation(:'six') #>> '{learner,outcode}', 'M1', 'from where they asked to start');

reset role;
select tests.create_user_with_id('c0000000-0000-0000-0000-000000000066', 'pupil6@example.com', 'Pupil 6 Surname');
update auth.users set email_confirmed_at = null where id = 'c0000000-0000-0000-0000-000000000066';
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.give_school_enquiry(%L, %L, 'c0000000-0000-0000-0000-000000000066') $$, :'six', :'ian'),
  'NOT_ALLOWED',
  'an instructor does not give pupils away'
);
select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.give_school_enquiry(%L, %L, 'c0000000-0000-0000-0000-000000000066') $$, :'six', :'ian'),
  'the owner gives the pupil to Ian'
);
select is(
  (select array[r.instructor_id::text, e.status::text, e.taken_instructor_id::text]
     from public.learner_relationships r, public.school_enquiries e
    where r.learner_id = 'c0000000-0000-0000-0000-000000000066' and r.business_id = :'school' and e.id = :'six'),
  array[:'ian', 'taken', :'ian'],
  'who becomes the school''s learner with Ian, and the enquiry is taken'
);
select throws_ok(
  format($$ select public.give_school_enquiry(%L, %L, gen_random_uuid()) $$, :'one', :'ian'),
  'VALIDATION_FAILED',
  'a pupil already taken is not given again'
);

reset role;
select is(
  (select array_agg(distinct action order by action) from public.audit_log
    where business_id = :'school' and action like 'school.enquiry_%'),
  array['school.enquiry_closed', 'school.enquiry_given', 'school.enquiry_offer_declined', 'school.enquiry_offered', 'school.enquiry_taken'],
  'each step is written down'
);
select is(
  (select schedule from cron.job where jobname = 'lapse-enquiry-offers'),
  '*/10 * * * *',
  'offers lapse every ten minutes'
);

select * from finish();
rollback;
