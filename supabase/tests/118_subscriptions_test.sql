-- Pro, paid for through the platform (9.18, D-231).
--
-- The point of most of this file is what somebody signed in *cannot* do. A subscription decides
-- who has Pro, so the browser having no way to write one is the security, and a test that only
-- proved the happy path would prove nothing about it.
begin;
select plan(45);

select tests.create_fixture();

\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian_profile 'b1000000-0000-0000-0000-000000000001'

-- ---------------------------------------------------------------------------------------
-- Nobody signed in can write one.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ insert into public.subscriptions (business_id, stripe_customer_id, billing_interval, status)
            values (%L, 'cus_forged', 'year', 'active') $$, :'asha_business'),
  '42501',
  null,
  'the owner of a Business cannot give themselves a subscription'
);

select tests.clear_authentication();
select public.system_start_subscription(:'asha_business', 'cus_asha', 'month') as started \gset

select tests.authenticate_as(:'asha_user');
select throws_ok(
  $$ update public.subscriptions set status = 'active', months_paid = 99 $$,
  '42501',
  null,
  'nor promote the one they have'
);
select throws_ok(
  $$ delete from public.subscriptions $$,
  '42501',
  null,
  'nor delete it to start again'
);
select throws_ok(
  format($$ select public.system_record_subscription('sub_forged', 'cus_asha', 'active', 'year',
                                                     now() + interval '1 year', false) $$),
  '42501',
  null,
  'and cannot call the function the webhook uses'
);
select throws_ok(
  format($$ select public.system_start_subscription(%L, 'cus_forged', 'year') $$, :'asha_business'),
  '42501',
  null,
  'nor the one that opens a checkout'
);

-- ---------------------------------------------------------------------------------------
-- Reading: your own, and only if the money would be yours.
-- ---------------------------------------------------------------------------------------
select is(
  (select count(*)::int from public.subscriptions where business_id = :'asha_business'),
  1,
  'the owner reads their own subscription'
);

select tests.clear_authentication();
select tests.authenticate_as(:'ian_user');
select is(
  (select count(*)::int from public.subscriptions),
  0,
  'an instructor at another Business sees none of it'
);
select throws_ok(
  format($$ select public.my_subscription(%L) $$, :'asha_business'),
  '42501',
  'NOT_ALLOWED',
  'and cannot read somebody else''s through the function either'
);

-- ---------------------------------------------------------------------------------------
-- A school cannot subscribe to Pro: it pays per instructor, which is Phase 2 (D-231).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select throws_ok(
  format($$ select public.system_start_subscription(%L, 'cus_school', 'month') $$, :'school'),
  'P0001',
  'VALIDATION_FAILED',
  'a school cannot be started on Pro'
);

-- ---------------------------------------------------------------------------------------
-- What the webhook writes, and what follows from it.
-- ---------------------------------------------------------------------------------------
select is(
  (select plan::text from public.businesses where id = :'asha_business'),
  'free',
  'starting a checkout grants nothing: incomplete is not Pro'
);

select public.system_record_subscription('sub_asha', 'cus_asha', 'active', 'month',
                                         '2026-11-30T09:00:00Z'::timestamptz, false) as recorded \gset
select is(:'recorded'::uuid, :'asha_business'::uuid, 'the event finds the Business by its customer');
select is(
  (select plan::text from public.businesses where id = :'asha_business'),
  'pro',
  'and an active subscription is what puts them on Pro'
);
select is(
  (select plan_expires_at from public.businesses where id = :'asha_business'),
  '2026-11-30T09:00:00Z'::timestamptz,
  'with the plan running to the end of what has been paid for'
);

-- A payment that failed does not take Pro away while Stripe is still trying (D-231).
select public.system_record_subscription('sub_asha', 'cus_asha', 'past_due', 'month',
                                         '2026-11-30T09:00:00Z'::timestamptz, false);
select is(
  (select plan::text from public.businesses where id = :'asha_business'),
  'pro',
  'a payment being retried leaves Pro alone'
);

-- ---------------------------------------------------------------------------------------
-- Paying is what moves the loyalty run along (D-206).
-- ---------------------------------------------------------------------------------------
select public.system_record_subscription('sub_asha', 'cus_asha', 'active', 'month',
                                         '2026-11-30T09:00:00Z'::timestamptz, false);
select public.system_record_subscription_payment('sub_asha', 1200, now(), 1, 0);
select public.system_record_subscription_payment('sub_asha', 1200, now(), 1, 0);
select is(
  (select months_paid from public.subscriptions where business_id = :'asha_business'),
  2,
  'each invoice paid adds the months it covered'
);
select is(
  (select last_paid_pence from public.subscriptions where business_id = :'asha_business'),
  1200,
  'and what was actually taken is kept, from the event rather than from arithmetic'
);

-- Leaving starts the run again, because that is what the promise says (D-206).
select public.system_record_subscription('sub_asha', 'cus_asha', 'canceled', 'month', null, false);
select is(
  (select months_paid from public.subscriptions where business_id = :'asha_business'),
  0,
  'ending it puts the run of months back to nothing'
);
select is(
  (select plan::text from public.businesses where id = :'asha_business'),
  'free',
  'and the Business is on Free again'
);

-- ---------------------------------------------------------------------------------------
-- A month earned by referring somebody (D-205, D-231).
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
insert into public.referrals (referrer_business_id, referred_business_id, code, reward_months)
values (:'asha_business', :'school', 'ABCD2345', 1);

select is(
  private.banked_referral_months(:'asha_business'),
  0,
  'signing up on somebody''s link earns them nothing yet'
);

-- Approving the instructor is what earns it.
select tests.authenticate_as(tests.create_user('staff.subs@test.local', 'Sam Support'), 'aal2');
select tests.clear_authentication();
insert into public.platform_staff (user_id, role)
select id, 'support_admin' from public.users where email = 'staff.subs@test.local'
on conflict do nothing;
select tests.authenticate_as((select id from public.users where email = 'staff.subs@test.local'), 'aal2');
select public.decide_verification(:'ian_profile', true, null);
select tests.clear_authentication();

select is(
  private.banked_referral_months(:'asha_business'),
  1,
  'approving the instructor they referred is what earns the month'
);

-- Deciding again earns nothing more.
select tests.authenticate_as((select id from public.users where email = 'staff.subs@test.local'), 'aal2');
select public.decide_verification(:'ian_profile', true, null);
select tests.clear_authentication();
select is(
  private.banked_referral_months(:'asha_business'),
  1,
  'and approving the same instructor again earns nothing more'
);

-- The month is spent by an invoice that used it, and only then.
select public.system_record_subscription('sub_asha', 'cus_asha', 'active', 'month',
                                         '2026-12-31T09:00:00Z'::timestamptz, false);
select public.system_record_subscription_payment('sub_asha', 0, now(), 1, 1);
select is(
  private.banked_referral_months(:'asha_business'),
  0,
  'an invoice that used the month spends it'
);
select isnt(
  (select reward_applied_at from public.referrals where referrer_business_id = :'asha_business'),
  null,
  'and the referral records when that was'
);

-- ---------------------------------------------------------------------------------------
-- An event is applied once, however many times Stripe sends it (D-235).
-- ---------------------------------------------------------------------------------------
-- This is the whole reason `system_process_billing_event` exists. The payment function adds to
-- `months_paid` and spends referral months, so applying it per delivery would hand out a loyalty
-- discount nobody earned.
select is(
  (select months_paid from public.subscriptions where stripe_subscription_id = 'sub_asha'),
  1,
  'the invoice above moved the run of months along by one'
);

select is(
  public.system_process_billing_event('evt_paid_1', 'invoice.paid', jsonb_build_object(
    'kind', 'invoice', 'subscriptionId', 'sub_asha', 'paidPence', 1200,
    'paidAt', now(), 'monthsCredited', 0
  )) ->> 'outcome',
  'payment_recorded',
  'an invoice event is applied'
);

select is(
  (select months_paid from public.subscriptions where stripe_subscription_id = 'sub_asha'),
  2,
  'and the month it paid for counts'
);

-- The same delivery again.
select is(
  public.system_process_billing_event('evt_paid_1', 'invoice.paid', jsonb_build_object(
    'kind', 'invoice', 'subscriptionId', 'sub_asha', 'paidPence', 1200,
    'paidAt', now(), 'monthsCredited', 0
  )) ->> 'outcome',
  'duplicate',
  'the same event again is a duplicate'
);

select is(
  (select months_paid from public.subscriptions where stripe_subscription_id = 'sub_asha'),
  2,
  'and it did not count twice'
);


-- A year counts twelve, and the interval comes off the row rather than from the caller.
select public.system_process_billing_event('evt_year', 'customer.subscription.updated', jsonb_build_object(
  'kind', 'subscription', 'subscriptionId', 'sub_asha', 'customerId', 'cus_asha',
  'status', 'active', 'interval', 'year', 'periodEnd', '2027-12-31T09:00:00Z', 'cancelAtPeriodEnd', false
));
select public.system_process_billing_event('evt_paid_year', 'invoice.paid', jsonb_build_object(
  'kind', 'invoice', 'subscriptionId', 'sub_asha', 'paidPence', 12000, 'paidAt', now(), 'monthsCredited', 0
));
select is(
  (select months_paid from public.subscriptions where stripe_subscription_id = 'sub_asha'),
  14,
  'a year adds twelve, and the twelve came from the row rather than the event'
);

-- The answer carries the run of months either side, because what a period costs is worked out
-- from `plans.ts` and this database has no prices in it (D-238).
select is(
  public.system_process_billing_event('evt_paid_2', 'invoice.paid', jsonb_build_object(
    'kind', 'invoice', 'subscriptionId', 'sub_asha', 'paidPence', 12000, 'paidAt', now()
  )) ->> 'monthsBefore',
  '14',
  'an applied invoice says what the run of months was'
);
select is(
  public.system_process_billing_event('evt_paid_3', 'invoice.paid', jsonb_build_object(
    'kind', 'invoice', 'subscriptionId', 'sub_asha', 'paidPence', 12000, 'paidAt', now()
  )) ->> 'monthsAfter',
  '38',
  'and what it became, a year at a time'
);
select is(
  public.system_process_billing_event('evt_odd_2', 'customer.discount.created', '{"kind": "other"}'::jsonb) ->> 'monthsAfter',
  null,
  'an event that moved no months says nothing about them'
);

-- An event for a subscription we have never heard of changes nothing and is still recorded, so
-- Stripe is answered and stops sending it.
select is(
  public.system_process_billing_event('evt_stranger', 'invoice.paid', jsonb_build_object(
    'kind', 'invoice', 'subscriptionId', 'sub_nobody', 'paidPence', 1200, 'paidAt', now()
  )) ->> 'outcome',
  'subscription_unknown',
  'an invoice for a subscription that is not ours is not applied'
);

select is(
  public.system_process_billing_event('evt_odd', 'customer.discount.created', '{"kind": "other"}'::jsonb) ->> 'outcome',
  'recorded',
  'an event nobody taught it is recorded and ignored'
);

-- Nobody signed in may apply one, which is what keeps Pro out of the browser's reach.
select tests.authenticate_as(:'asha_user');
select throws_ok(
  $$select public.system_process_billing_event('evt_forged', 'invoice.paid', '{"kind": "invoice"}'::jsonb)$$,
  '42501',
  null,
  'an owner cannot apply a billing event'
);
select throws_ok(
  $$select public.system_record_subscription_payment('sub_asha', 0, now(), 12, 12)$$,
  '42501',
  null,
  'nor reach past it for the function that counts the months'
);
-- Who is about to be charged, and how much, is the job's to read and nobody else's (D-237).
select throws_ok(
  $$select * from public.system_subscriptions_renewing(now())$$,
  '42501',
  null,
  'nor read who is about to be charged'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------
-- Who is warned before it renews, and who is not (D-237).
-- ---------------------------------------------------------------------------------------
-- The window is worked out in the function, not passed to it, so nothing that calls it can
-- make it warn somebody too late. A fortnight on a year, three days on a month.
create or replace function pg_temp.renewing(p_at timestamptz) returns integer language sql as $$
  select count(*)::integer from public.system_subscriptions_renewing(p_at)
   where business_id = 'aaaa0000-0000-0000-0000-000000000000'::uuid;
$$;

update public.subscriptions
   set status = 'active', billing_interval = 'year', cancel_at_period_end = false,
       current_period_end = '2027-01-01T09:00:00Z'::timestamptz
 where stripe_subscription_id = 'sub_asha';

select is(pg_temp.renewing('2026-12-25T09:00:00Z'::timestamptz), 1, 'a year renewing in a week is warned');
select is(pg_temp.renewing('2026-12-18T09:00:00Z'::timestamptz), 1, 'and on the fourteenth day it still is');
select is(pg_temp.renewing('2026-12-10T09:00:00Z'::timestamptz), 0, 'three weeks out is too early to warn');
select is(pg_temp.renewing('2027-01-02T09:00:00Z'::timestamptz), 0, 'and once it has renewed there is nothing to warn about');

update public.subscriptions set billing_interval = 'month' where stripe_subscription_id = 'sub_asha';
select is(pg_temp.renewing('2026-12-30T09:00:00Z'::timestamptz), 1, 'a month renewing in two days is warned');
select is(pg_temp.renewing('2026-12-25T09:00:00Z'::timestamptz), 0, 'a week out is too early for a monthly one');

update public.subscriptions set cancel_at_period_end = true where stripe_subscription_id = 'sub_asha';
select is(pg_temp.renewing('2026-12-30T09:00:00Z'::timestamptz), 0,
          'nobody is warned about a charge that is not coming');

update public.subscriptions set cancel_at_period_end = false, status = 'canceled'
 where stripe_subscription_id = 'sub_asha';
select is(pg_temp.renewing('2026-12-30T09:00:00Z'::timestamptz), 0, 'nor about one that has ended');

select * from finish();
rollback;
