-- Joining a school carries the profile over, and a badge belongs to a person (AUTH-05, D-230, D-324).
begin;
select plan(9);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ian 'b1000000-0000-0000-0000-000000000001'

-- Asha set up her own profile in full: who she is, her car, her area, her badge and her hours.
update public.instructor_profiles
   set bio = 'Patient, calm, and local.', transmission = 'manual', car_make = 'Ford', car_model = 'Fiesta',
       radius_miles = 8, base_postcode = 'LS6 1AB', badge_expiry = private.today() + 400,
       onboarding_step = 5, onboarding_completed_at = now()
 where id = :'asha';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time) values
  (:'asha', 'aaaa0000-0000-0000-0000-000000000000', 1, '09:00', '17:00'),
  (:'asha', 'aaaa0000-0000-0000-0000-000000000000', 3, '09:00', '13:00');

select tests.authenticate_as(:'ben');
select token as asha_token from public.invite_member(:'school', 'instructor', 'link', 'Asha', null, null) \gset
select tests.authenticate_as(:'asha_user');
select public.accept_member_invitation(:'asha_token');
reset role;

select id as made from public.instructor_profiles where user_id = :'asha_user' and business_id = :'school' \gset

select is(
  (select jsonb_build_object('name', display_name, 'bio', bio, 'car', car_make || ' ' || car_model, 'base', base_postcode, 'miles', radius_miles)
     from public.instructor_profiles where id = :'made'),
  '{"name": "Asha", "bio": "Patient, calm, and local.", "car": "Ford Fiesta", "base": "LS6 1AB", "miles": 8}'::jsonb,
  'her school profile starts from her own: who she is, her car and where she teaches'
);
select is(
  (select badge_number || ' ' || verification_status::text from public.instructor_profiles where id = :'made'),
  '123456 approved',
  'with her badge, which the school vouches for'
);
select is(
  (select count(*)::int from public.working_hours where instructor_id = :'made'),
  2,
  'and her hours'
);
select ok(
  (select onboarding_completed_at is not null from public.instructor_profiles where id = :'made'),
  'having set up her own in full, she is set up here too'
);
select is(
  (select badge_number from public.instructor_profiles where id = :'asha'),
  '123456',
  'and her own profile keeps its badge while it is paused'
);

-- A badge belongs to a person: two of her profiles may hold it, nobody else may.
select throws_ok(
  format($$ update public.instructor_profiles set badge_number = '123456' where id = %L $$, :'ian'),
  '23P01', null,
  'somebody else cannot hold her badge number, however the row is written'
);
select tests.authenticate_as('b0000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.submit_verification(%L, 'adi', '123456', private.today() + 300, true) $$, :'ian'),
  'P0001', 'BADGE_TAKEN',
  'nor send it to be checked'
);
reset role;
select tests.authenticate_as(:'asha_user');
select is(
  public.submit_verification(:'made', 'adi', '123456', private.today() + 500, true)::text,
  'approved',
  'while she may send it again on her school profile'
);
reset role;

-- Somebody coming back to a school they left keeps the profile they had there.
update public.instructor_profiles set bio = 'At the school.' where id = :'made';
update public.memberships set status = 'deactivated' where business_id = :'school' and user_id = :'asha_user';
select tests.authenticate_as(:'ben');
select token as again from public.invite_member(:'school', 'instructor', 'link', 'Asha', null, null) \gset
select tests.authenticate_as(:'asha_user');
select public.accept_member_invitation(:'again');
reset role;
select is((select bio from public.instructor_profiles where id = :'made'), 'At the school.', 'coming back, she keeps the profile she had there');

select * from finish();
rollback;
