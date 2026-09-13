-- Events from the payments provider, processed exactly once (R-11, M3-03).
begin;
select plan(10);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_events');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- The first delivery.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event(
     'evt_1', 'account.updated', 'acct_events',
     jsonb_build_object('id', 'acct_events', 'charges_enabled', true, 'payouts_enabled', true,
                        'details_submitted', true)) ->> 'outcome'),
  'account_updated',
  'the first delivery is applied'
);

select is(
  (select stripe_charges_enabled from public.businesses where id = :'school'),
  true,
  'and the Business can take payments'
);

-- ---------------------------------------------------------------------------------------
-- The second and third deliveries of the same event (acceptance-06).
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event(
     'evt_1', 'account.updated', 'acct_events',
     jsonb_build_object('id', 'acct_events', 'charges_enabled', false, 'payouts_enabled', false,
                        'details_submitted', false)) ->> 'outcome'),
  'duplicate',
  'the same event again changes nothing'
);

select is(
  (select stripe_charges_enabled from public.businesses where id = :'school'),
  true,
  'so a repeat cannot undo what the first one did'
);

select is(
  (select count(*)::int from public.provider_events where event_id = 'evt_1'),
  1,
  'and there is one record of it, however many times it arrives'
);

-- ---------------------------------------------------------------------------------------
-- Events about something else.
-- ---------------------------------------------------------------------------------------
select is(
  (select public.system_process_stripe_event('evt_2', 'charge.dispute.created', 'acct_events',
     jsonb_build_object('id', 'dp_1')) ->> 'outcome'),
  'recorded',
  'an event nothing acts on yet is still written down'
);

select is(
  (select public.system_process_stripe_event('evt_4', 'payment_intent.succeeded', 'acct_events',
     jsonb_build_object('id', 'pi_nothing', 'amount_received', 4200)) ->> 'outcome'),
  'no_booking',
  'a payment that says nothing about what it was for is recorded and left alone'
);

select is(
  (select public.system_process_stripe_event('evt_3', 'account.updated', 'acct_nobody',
     jsonb_build_object('id', 'acct_nobody', 'charges_enabled', true)) ->> 'outcome'),
  'account_unknown',
  'an account we have never heard of is recorded and changes nothing'
);

select is(
  (select processed_at is not null from public.provider_events where event_id = 'evt_2'),
  true,
  'everything applied says when it was'
);

select throws_ok(
  $$ select public.system_process_stripe_event('', 'account.updated', 'acct_events', '{}'::jsonb) $$,
  'P0001', 'VALIDATION_FAILED', 'an event with no id is refused'
);

select * from finish();
rollback;
