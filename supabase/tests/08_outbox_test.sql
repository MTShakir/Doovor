-- Transactional outbox for background jobs (M1-01, D-017, PRD 14.5).
begin;
select plan(12);

select tests.create_user('outbox@test.local', 'Oscar Outbox') as user \gset

-- Start from an empty outbox: a development database carries events from earlier runs, and
-- the dispatcher claims whatever is waiting. The transaction rolls back either way.
delete from public.outbox_events;

-- Structure
select has_table('public', 'outbox_events', 'the outbox table exists');
select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'outbox_events'),
  'the outbox has row-level security'
);

-- Nobody reads or writes it through the API: jobs use the system functions instead.
select tests.authenticate_as(:'user');
select throws_ok(
  $$ select id from public.outbox_events $$,
  '42501',
  null,
  'a signed-in person cannot read the outbox at all: there is no grant, let alone a policy'
);
select throws_ok(
  $$ insert into public.outbox_events (name) values ('booking/confirmed') $$,
  '42501',
  null,
  'a signed-in person cannot write to the outbox'
);
select throws_ok(
  format($$ select public.system_claim_outbox_events(10) $$),
  '42501',
  null,
  'a signed-in person cannot claim outbox events'
);

-- Enqueue happens inside the transaction that made the change it describes.
select tests.clear_authentication();
select private.enqueue_event('booking/confirmed', jsonb_build_object('booking_id', gen_random_uuid())) as first \gset
select private.enqueue_event('booking/cancelled', jsonb_build_object('booking_id', gen_random_uuid())) as second \gset
select is(
  (select count(*)::int from public.outbox_events where sent_at is null),
  2,
  'enqueued events wait to be sent'
);
select is(
  (select payload ? 'booking_id' from public.outbox_events where id = :'first'),
  true,
  'the event carries its identifiers'
);

-- The dispatcher claims, sends, then marks. Claiming counts an attempt.
select is(
  (select count(*)::int from public.system_claim_outbox_events(10)),
  2,
  'the dispatcher claims pending events'
);
select is(
  (select attempts from public.outbox_events where id = :'first'),
  1,
  'claiming counts an attempt, so a repeatedly failing event gives up'
);
select is(public.system_mark_outbox_sent(array[:'first'::uuid]), 1, 'sent events are marked');
select is(
  (select count(*)::int from public.system_claim_outbox_events(10)),
  1,
  'a sent event is never claimed again'
);
select is(
  public.system_mark_outbox_failed(array[:'second'::uuid], 'connection refused'),
  1,
  'a failed send records why'
);

select * from finish();
rollback;
