-- A notification is sent by one run at a time, and so is an outbox event (NTF-01, D-367).
begin;
select plan(7);

select tests.create_fixture();

\set lee 'c0000000-0000-0000-0000-000000000001'

select public.system_notify(jsonb_build_array(
  jsonb_build_object(
    'user_id', :'lee', 'kind', 'booking.reminder', 'category', 'reminders',
    'title', 'Lesson tomorrow', 'body', 'Fri 23 Oct at 09:00 with Ian.',
    'channels', jsonb_build_array('in_app', 'email', 'sms'),
    'dedupe_key', 'booking.reminder:d367:1:lee'
  )
));
select id as reminder from public.notifications where dedupe_key = 'booking.reminder:d367:1:lee' \gset

select is(
  (select count(*)::int from public.system_claim_notifications(200) where dedupe_key = 'booking.reminder:d367:1:lee'),
  1,
  'one run claims the reminder to send it'
);
select is(
  (select count(*)::int from public.system_claim_notifications(200) where dedupe_key = 'booking.reminder:d367:1:lee'),
  0,
  'a second run at the same moment does not, so it is not texted twice'
);

select public.system_mark_notification_failed(:'reminder', 'The text service could not be reached.');
select is(
  (select count(*)::int from public.system_claim_notifications(200) where dedupe_key = 'booking.reminder:d367:1:lee'),
  1,
  'once it has failed, the next run tries it again'
);

update public.notifications set claimed_at = now() - interval '11 minutes' where id = :'reminder';
select is(
  (select count(*)::int from public.system_claim_notifications(200) where dedupe_key = 'booking.reminder:d367:1:lee'),
  1,
  'and a claim whose run died is free again after ten minutes'
);

select public.system_mark_notifications_sent(array[:'reminder'::uuid]);
select is(
  (select count(*)::int from public.system_claim_notifications(200) where dedupe_key = 'booking.reminder:d367:1:lee'),
  0,
  'sent is sent'
);

-- The outbox's events, the same way.
select private.enqueue_event('test/d367', jsonb_build_object('marker', 'd367'));
select is(
  (select count(*)::int from public.system_claim_outbox_events(500) where payload ->> 'marker' = 'd367'),
  1,
  'one run claims an event to dispatch it'
);
select is(
  (select count(*)::int from public.system_claim_outbox_events(500) where payload ->> 'marker' = 'd367'),
  0,
  'and a second run at the same moment does not'
);

select * from finish();
rollback;
