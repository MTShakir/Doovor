-- Sending what the core decided to send (NTF-03, M2-28).
begin;
select plan(7);

select tests.create_fixture();

\set lee 'c0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'

select public.system_notify(jsonb_build_array(
  jsonb_build_object(
    'user_id', :'lee', 'kind', 'booking.cancelled', 'category', 'bookings',
    'title', 'Lesson cancelled', 'body', 'Wed 16 Sep at 09:00 with Ian.',
    'link', '/app/learner/lessons', 'channels', jsonb_build_array('in_app', 'push', 'email'),
    'dedupe_key', 'booking.cancelled:b1:2:lee'
  ),
  jsonb_build_object(
    'user_id', :'ian_user', 'kind', 'learner.joined', 'category', 'account',
    'title', 'Lee One joined you', 'body', 'They can be booked in now.',
    'channels', jsonb_build_array('in_app'),
    'dedupe_key', 'learner.joined:l1:1:ian'
  )
));

-- ---------------------------------------------------------------------------------------
-- Claiming.
-- ---------------------------------------------------------------------------------------
select is(
  (select count(*)::int from public.system_claim_notifications(10)),
  1,
  'only what has somewhere to be sent is claimed: the inbox needs no sending'
);

select is(
  (select attempts from public.notifications where dedupe_key = 'booking.cancelled:b1:2:lee'),
  1,
  'claiming counts an attempt, so nothing can fail for ever'
);

select is(
  (select email from public.system_claim_notifications(10)),
  'learner.1@test.local',
  'and the claim says where to send it'
);

-- ---------------------------------------------------------------------------------------
-- Marking.
-- ---------------------------------------------------------------------------------------
select id as sent from public.notifications where dedupe_key = 'booking.cancelled:b1:2:lee' \gset

select is(
  (select public.system_mark_notifications_sent(array[:'sent'::uuid])),
  1,
  'a message that went out is marked sent'
);

select is(
  (select count(*)::int from public.system_claim_notifications(10)),
  0,
  'and is never claimed again'
);

select is(
  (select public.system_mark_notifications_sent(array[:'sent'::uuid])),
  0,
  'marking it twice changes nothing'
);

-- Something that failed keeps the reason, for whoever has to work out why.
select public.system_notify(jsonb_build_array(
  jsonb_build_object(
    'user_id', :'lee', 'kind', 'booking.confirmed', 'category', 'bookings',
    'title', 'Lesson booked', 'body', 'Thu 17 Sep at 09:00 with Ian.',
    'channels', jsonb_build_array('in_app', 'email'),
    'dedupe_key', 'booking.confirmed:b2:1:lee'
  )
));
select id as trouble from public.notifications where dedupe_key = 'booking.confirmed:b2:1:lee' \gset
select public.system_mark_notification_failed(:'trouble', 'The service could not be reached.');

select is(
  (select last_error from public.notifications where id = :'trouble'),
  'The service could not be reached.',
  'a failure says what went wrong, and the message waits to be tried again'
);

select * from finish();
rollback;
