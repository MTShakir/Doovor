-- Connecting a Business to its payments account (PAY-01, PAY-12, M3-02).
begin;
select plan(10);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set solo 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- ---------------------------------------------------------------------------------------
-- Only an owner connects payments.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'mia');
select throws_ok(
  format($$ select public.set_payments_account(%L, 'acct_manager') $$, :'school'),
  '42501', null, 'a manager cannot connect payments (acceptance-11)'
);

select tests.clear_authentication();
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.set_payments_account(%L, 'acct_instructor') $$, :'school'),
  '42501', null, 'nor can an instructor'
);

select tests.clear_authentication();
select tests.authenticate_as(:'ben');
select is(
  (select public.set_payments_account(:'school', 'acct_school') ->> 'account_id'),
  'acct_school',
  'the owner connects the account the provider made'
);

select is(
  (select stripe_account_id from public.businesses where id = :'school'),
  'acct_school',
  'and it is written down against the Business'
);

select is(
  (select stripe_connected_at is not null from public.businesses where id = :'school'),
  true,
  'with when it happened'
);

-- ---------------------------------------------------------------------------------------
-- One Business, one account.
-- ---------------------------------------------------------------------------------------
select lives_ok(
  format($$ select public.set_payments_account(%L, 'acct_school') $$, :'school'),
  'connecting the same account again changes nothing'
);

select throws_ok(
  format($$ select public.set_payments_account(%L, 'acct_somewhere_else') $$, :'school'),
  'P0001', 'VALIDATION_FAILED', 'and a different account is refused, because the money would go elsewhere'
);

select tests.clear_authentication();
select tests.authenticate_as(:'asha');
select throws_ok(
  format($$ select public.set_payments_account(%L, 'acct_school') $$, :'solo'),
  '23505', null, 'no two Businesses share one account'
);

-- ---------------------------------------------------------------------------------------
-- What the provider says about it.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select is(
  (select public.system_set_payments_state('acct_school', true, false, true)),
  1,
  'a job writes back what the provider says'
);

select is(
  (select stripe_charges_enabled and stripe_details_submitted and not stripe_payouts_enabled
     from public.businesses where id = :'school'),
  true,
  'and the Business can take payments while its payouts are still being set up'
);

select * from finish();
rollback;
