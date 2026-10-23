-- Somebody with no email address holds up nobody's notifications (NTF-01, NTF-03, D-373).
begin;
select plan(3);

\set dan 'e0000000-0000-0000-0000-000000000173'

-- A learner an instructor added by hand, with a mobile number and no email (D-068).
insert into auth.users (
  instance_id, id, aud, role, email, phone, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', :'dan', 'authenticated', 'authenticated', null, '447700900173', '',
  '{"provider": "phone", "providers": ["phone"]}', '{"full_name": "Dan Byhand"}', now(), now()
);

select is(
  (select email from public.users where id = :'dan'),
  null,
  'they have no email address'
);

select public.system_notify(jsonb_build_array(
  jsonb_build_object(
    'user_id', :'dan', 'kind', 'booking.confirmed', 'category', 'bookings',
    'title', 'Lesson booked', 'body', 'Mon 26 Oct at 15:00 with Ivy.',
    'channels', jsonb_build_array('in_app', 'email', 'push'),
    'dedupe_key', 'booking.confirmed:d373:1:dan'
  )
));

create temporary table claimed on commit drop as
  select * from public.system_claim_notifications(500) where dedupe_key = 'booking.confirmed:d373:1:dan';

select is(
  (select count(*)::int from claimed),
  1,
  'their notification is claimed to send like anybody else''s'
);
select is(
  (select email from claimed),
  '',
  'with an empty address rather than none, which the sender reads as nothing to email'
);

select * from finish();
rollback;
