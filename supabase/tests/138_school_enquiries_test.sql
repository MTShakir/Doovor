-- New pupils for a school, from its public page or its office, read by nobody else (M9-15, M9-16,
-- D-288).
begin;
select plan(22);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

\set consent 'I agree to Bee School keeping these details and passing them to an instructor.'

select tests.authenticate_as_anon();
select lives_ok(
  format($$ select public.submit_school_enquiry(p_slug => 'bee-school', p_full_name => 'Pat Pupil', p_postcode => 'm1 1ae',
                                                p_consent => %L, p_email => 'pat@example.com', p_phone => '+447700900123',
                                                p_transmission => 'automatic', p_note => 'Weekday evenings') $$, :'consent'),
  'anybody can ask the school for lessons from its page'
);
select throws_ok(
  $$ select count(*) from public.school_enquiries $$,
  '42501',
  null,
  'and cannot read what anybody asked'
);
select throws_ok(
  format($$ select public.submit_school_enquiry('asha-driving', 'Pat', 'M1 1AE', %L, 'pat@example.com') $$, :'consent'),
  'NOT_FOUND',
  'a business that is not a school takes no enquiries this way'
);
select throws_ok(
  $$ select public.submit_school_enquiry('bee-school', 'Pat', 'M1 1AE', '', 'pat@example.com') $$,
  'CONSENT_REQUIRED',
  'nothing is kept without their agreement'
);
select throws_ok(
  format($$ select public.submit_school_enquiry('bee-school', 'Pat', 'M1 1AE', %L) $$, :'consent'),
  'VALIDATION_FAILED',
  'nor without a way to reach them'
);
select throws_ok(
  format($$ select public.submit_school_enquiry('bee-school', 'Pat', 'not a postcode', %L, 'pat@example.com') $$, :'consent'),
  'VALIDATION_FAILED',
  'nor without a postcode'
);
select throws_ok(
  format($$ select public.submit_school_enquiry('bee-school', 'Pat', 'M1 1AE', %L, p_phone => '07700 900123') $$, :'consent'),
  'VALIDATION_FAILED',
  'a mobile number arrives written the one way'
);

select tests.authenticate_as(:'ben');
select is(
  (select array[full_name, email, phone, postcode, transmission::text, note, source, status::text, consent_wording]
     from public.school_enquiries where school_id = :'school'),
  array['Pat Pupil', 'pat@example.com', '+447700900123', 'M1 1AE', 'automatic', 'Weekday evenings', 'public', 'new', :'consent'],
  'the owner sees it in the inbox, with the words they agreed to'
);

select tests.authenticate_as(:'manager');
select lives_ok(
  format($$ select public.add_school_enquiry(%L, 'Sam Caller', 'M1 1AE', %L, p_phone => '+447700900124') $$, :'school', :'consent'),
  'a manager adds somebody who rang'
);
select is(
  (select array[source, created_by::text] from public.school_enquiries where full_name = 'Sam Caller'),
  array['office', :'manager'],
  'as the office'
);

select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.add_school_enquiry(%L, 'Sam', 'M1 1AE', %L, p_phone => '+447700900124') $$, :'school', :'consent'),
  'NOT_ALLOWED',
  'an instructor at the school does not'
);
select is((select count(*)::int from public.school_enquiries), 0, 'nor reads the inbox');
select tests.authenticate_as(:'asha_user');
select is((select count(*)::int from public.school_enquiries), 0, 'nor does anybody outside the school');

-- Closed, and back again.
select tests.authenticate_as(:'ben');
select id as pat from public.school_enquiries where full_name = 'Pat Pupil' \gset
select public.close_school_enquiry(:'pat', 'Booked elsewhere');
select is(
  (select array[status::text, closed_reason] from public.school_enquiries where id = :'pat'),
  array['closed', 'Booked elsewhere'],
  'an enquiry that went nowhere is closed, with why'
);
select public.reopen_school_enquiry(:'pat');
select is(
  (select array[status::text, coalesce(closed_reason, 'none')] from public.school_enquiries where id = :'pat'),
  array['new', 'none'],
  'and opened again'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.close_school_enquiry(%L) $$, :'pat'),
  'NOT_ALLOWED',
  'only the school closes one'
);

reset role;
update public.school_enquiries set status = 'taken', taken_at = now(), taken_business_id = :'school' where full_name = 'Sam Caller';
select tests.authenticate_as(:'ben');
select throws_ok(
  $$ select public.close_school_enquiry((select id from public.school_enquiries where full_name = 'Sam Caller')) $$,
  'VALIDATION_FAILED',
  'one taken by an instructor stays taken'
);

reset role;
select is(
  (select array_agg(after ->> 'source' order by after ->> 'source') from public.audit_log
    where action = 'school.enquiry_received' and business_id = :'school'),
  array['office', 'public'],
  'each enquiry is written down, saying where it came from'
);

-- Forgotten after a year.
insert into public.school_enquiries (school_id, full_name, email, postcode, source, consent_wording, status, closed_at, created_at)
values (:'school', 'Old Ask', 'old@example.com', 'M1 1AE', 'public', :'consent', 'closed', now() - interval '13 months', now() - interval '14 months');
select is(public.system_forget_school_enquiries(), 1, 'an enquiry closed a year ago is forgotten');
select is((select count(*)::int from public.school_enquiries where school_id = :'school'), 2, 'and the rest are kept');
select is(
  (select schedule from cron.job where jobname = 'forget-school-enquiries'),
  '23 3 * * *',
  'every night'
);

-- Ten an hour from one place.
select tests.authenticate_as_anon();
select throws_ok(
  format($$ select public.submit_school_enquiry('bee-school', 'Pat ' || n, 'M1 1AE', %L, 'pat' || n || '@example.com')
              from generate_series(1, 12) as n $$, :'consent'),
  'RATE_LIMITED',
  'and no more'
);

select * from finish();
rollback;
