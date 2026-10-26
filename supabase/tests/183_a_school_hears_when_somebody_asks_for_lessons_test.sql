-- A school hears when somebody asks it for lessons (NTF-03, D-398).
begin;
select plan(5);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set consent 'I agree to Bee School keeping these details and passing them to an instructor.'

select tests.authenticate_as_anon();
select public.submit_school_enquiry(p_slug => 'bee-school', p_full_name => 'Pat Pupil', p_postcode => 'M1 1AE',
                                    p_consent => :'consent', p_email => 'pat@example.com', p_transmission => 'automatic');
select tests.clear_authentication();
select id as asked from public.school_enquiries where school_id = :'school' and full_name = 'Pat Pupil' \gset

select is(
  (select count(*)::int from public.outbox_events
    where name = 'school.notice' and payload ->> 'kind' = 'pupil.asked' and payload ->> 'id' = :'asked'),
  1,
  'somebody asking on the school''s page queues a notice to the school'
);

select is(
  (select jsonb_build_array(n -> 'recipients', n ->> 'learner_name', n ->> 'area', n ->> 'transmission', n ->> 'business_id')
     from (select public.system_school_notice('pupil.asked', :'asked') as n) as notice),
  jsonb_build_array(
    jsonb_build_array(jsonb_build_object('user_id', :'ben', 'audience', 'school'), jsonb_build_object('user_id', :'manager', 'audience', 'school')),
    'Pat Pupil', 'M1', 'automatic', :'school'
  ),
  'which tells its owner and managers who asked, roughly where, and for which gearbox'
);

-- Somebody the office types in itself is not news to it.
select tests.authenticate_as(:'ben');
select public.add_school_enquiry(:'school', 'Sam Caller', 'M1 1AE', :'consent', p_phone => '+447700900124') as typed \gset
select tests.clear_authentication();
select is(
  (select count(*)::int from public.outbox_events
    where name = 'school.notice' and payload ->> 'kind' = 'pupil.asked' and payload ->> 'id' = :'typed'),
  0,
  'one the office adds by hand queues nothing'
);

-- Once somebody has done something about them, the notice has nothing left to say.
update public.school_enquiries set status = 'closed', closed_at = now(), closed_reason = 'Found another school' where id = :'asked';
select is(public.system_school_notice('pupil.asked', :'asked'), null, 'nor does an enquiry already dealt with');

select ok(
  not has_function_privilege('authenticated', 'public.system_school_notice(text, uuid)', 'execute'),
  'only the job runner reads it'
);

select * from finish();
rollback;
