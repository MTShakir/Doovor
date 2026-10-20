-- A school vouches for its own instructors: their profiles are live without the platform checking a
-- photo, their badge's details are still kept, and the platform's tick is only for a badge it checked
-- (M9-03, D-280).
begin;
select plan(12);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- ---------------------------------------------------------------------------------------
-- A profile made at a school is vouched for as it is made; one of a Business of one is not.
-- ---------------------------------------------------------------------------------------
select tests.create_user('new.instructor@test.local', 'Nia New') as nia \gset
select tests.create_user('own.instructor@test.local', 'Oli Own') as oli \gset
insert into public.businesses (id, type, name, slug)
values ('cccc0000-0000-0000-0000-000000000000', 'independent', 'Oli Driving', 'oli-driving');
insert into public.memberships (business_id, user_id, role) values
  (:'school', :'nia', 'instructor'),
  ('cccc0000-0000-0000-0000-000000000000', :'oli', 'owner');
insert into public.instructor_profiles (user_id, business_id, display_name) values
  (:'nia', :'school', 'Nia'),
  (:'oli', 'cccc0000-0000-0000-0000-000000000000', 'Oli');

select results_eq(
  format($$ select verification_status::text, vouched_at is not null from public.instructor_profiles where user_id = %L $$, :'nia'),
  $$ values ('approved'::text, true) $$,
  'an instructor joining a school is vouched for by it from the start, with nothing to send the platform'
);
select results_eq(
  format($$ select verification_status::text, vouched_at is null from public.instructor_profiles where user_id = %L $$, :'oli'),
  $$ values ('unsubmitted'::text, true) $$,
  'an instructor on their own still has their badge checked by the platform (INS-02)'
);

-- ---------------------------------------------------------------------------------------
-- A school's instructor keeps their badge's details, without a photo.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select is(
  public.submit_verification(:'ian', 'adi', '765 432', (private.today() + 300)::date, true),
  'approved'::public.verification_status,
  'sending the badge''s details needs no photo and leaves the profile live'
);
select tests.clear_authentication();
select results_eq(
  format($$ select badge_number, badge_expiry = private.today() + 300, badge_path is null,
                   verification_status::text, vouched_at is not null
              from public.instructor_profiles where id = %L $$, :'ian'),
  $$ values ('765432'::text, true, true, 'approved'::text, true) $$,
  'the number and expiry are kept for the reminders, and no photo is stored'
);
select is(
  (select count(*)::int from public.audit_log where action = 'instructor.badge_vouched' and entity_id = :'ian'),
  1,
  'the audit log says the school vouched for the badge'
);
select is(
  (select count(*)::int from public.outbox_events
    where name = 'instructor/verification-submitted' and payload ->> 'instructor_profile_id' = :'ian'),
  0,
  'and nobody on the platform is asked to review it'
);

-- An instructor on their own still needs the photo, and one badge is still one account's.
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '876543', (private.today() + 300)::date, true) $$, :'asha'),
  'VALIDATION_FAILED',
  'an instructor on their own cannot send a badge without its photo (D-262)'
);
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '765432', (private.today() + 300)::date, true) $$, :'ivy'),
  'BADGE_TAKEN',
  'and a badge already on another account is refused, at a school too (D-230)'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- The booking link: live for a vouched instructor, with the platform's tick only for a badge it checked.
-- ---------------------------------------------------------------------------------------
update public.instructor_profiles set public_slug = 'ian-vouched' where id = :'ian';
update public.instructor_profiles
   set public_slug = 'asha-checked', verification_status = 'approved', verified_at = now(),
       badge_expiry = private.today() + 300
 where id = :'asha';

select is(
  (public.booking_page('ian-vouched') ->> 'platformChecked')::boolean,
  false,
  'a school''s instructor takes bookings, without the tick the platform gives a badge it checked'
);
select is(
  (public.booking_page('asha-checked') ->> 'platformChecked')::boolean,
  true,
  'an instructor on their own whose badge the platform checked has it'
);

-- A badge that has run out still closes the link, vouched for or not (INS-03).
update public.instructor_profiles set badge_expiry = private.today() - 1 where id = :'ian';
select is(public.booking_page('ian-vouched'), null, 'a vouched badge that has run out takes no bookings');

-- The old rule for a decided badge stays: a refusal before the school vouched is still a refusal.
select tests.create_user('refused.instructor@test.local', 'Ray Refused') as ray \gset
insert into public.memberships (business_id, user_id, role) values (:'school', :'ray', 'instructor');
insert into public.instructor_profiles (user_id, business_id, display_name, verification_status)
values (:'ray', :'school', 'Ray', 'rejected');
select results_eq(
  format($$ select verification_status::text, vouched_at is null from public.instructor_profiles where user_id = %L $$, :'ray'),
  $$ values ('rejected'::text, true) $$,
  'a profile made already decided keeps the decision rather than being vouched for'
);

select * from finish();
rollback;
