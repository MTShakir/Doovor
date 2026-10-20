-- The cancellation policy a learner books under, said before they book (BOK-09, R-06, R-09).
begin;
select plan(10);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set liz 'c0000000-0000-0000-0000-000000000003'

update public.instructor_profiles
   set public_slug = 'ian-one', verification_status = 'approved', badge_expiry = private.today() + 200
 where id = :'ian';
update public.instructor_profiles
   set public_slug = 'asha-driving', verification_status = 'approved', badge_expiry = private.today() + 200
 where id = :'asha';

-- A stranger on the booking link, with no account at all.
select tests.authenticate_as_anon();
select is(
  public.cancellation_policy(:'ian'),
  '{"windowHours": 48, "lateFeePercent": 100}'::jsonb,
  'a visitor is told the policy, which for a Business that changed nothing is the platform''s'
);
select throws_ok(
  format($$ select private.booking_rules(%L) $$, :'ian'),
  '42501', null,
  'and only the policy: the rules it comes from stay private'
);

-- The school sets its own, and that is the one its instructors' links say.
select tests.clear_authentication();
update public.businesses
   set settings = coalesce(settings, '{}'::jsonb) || '{"cancellation_window_hours": 24, "late_fee_percent": 50}'::jsonb
 where id = :'school';
select tests.authenticate_as_anon();
select is(
  public.cancellation_policy(:'ian'),
  '{"windowHours": 24, "lateFeePercent": 50}'::jsonb,
  'a Business''s own policy is the one its link shows'
);

select tests.authenticate_as(:'liz');
select is(
  public.cancellation_policy(:'ian'),
  '{"windowHours": 24, "lateFeePercent": 50}'::jsonb,
  'a learner signed in is told the same'
);

-- A Business that changed nothing follows the platform when the platform's default moves.
select tests.clear_authentication();
update public.platform_settings
   set value = value || '{"cancellation_window_hours": 72}'::jsonb
 where key = 'booking_defaults';
select tests.authenticate_as_anon();
select is(
  public.cancellation_policy(:'asha'),
  '{"windowHours": 72, "lateFeePercent": 100}'::jsonb,
  'an independent instructor who changed nothing has the platform''s window'
);

-- Only for an instructor whose link takes bookings, as booking_page answers (BOK-02, INS-02, ADM-02).
select is(public.cancellation_policy(:'ivy'), null, 'an instructor with no booking link has no policy to show');
select is(public.cancellation_policy(gen_random_uuid()), null, 'nor does an instructor nobody has');

select tests.clear_authentication();
update public.instructor_profiles set verification_status = 'pending' where id = :'asha';
select tests.authenticate_as_anon();
select is(public.cancellation_policy(:'asha'), null, 'nor one waiting to be verified');

select tests.clear_authentication();
update public.instructor_profiles set badge_expiry = private.today() - 1 where id = :'ian';
select tests.authenticate_as_anon();
select is(public.cancellation_policy(:'ian'), null, 'nor one whose badge has run out');

select tests.clear_authentication();
update public.instructor_profiles set badge_expiry = private.today() + 200 where id = :'ian';
update public.businesses set status = 'suspended' where id = :'school';
select tests.authenticate_as_anon();
select is(public.cancellation_policy(:'ian'), null, 'nor one at a Business that is suspended');

select * from finish();
rollback;
