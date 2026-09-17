-- acceptance-11 in the database: a school manager cannot see payouts or billing (PRD 6.2, M5-16).
begin;
select plan(19);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000009'

-- The school has an account that pays out, is on the School plan, and took £42 for Ian's lesson.
update public.businesses
   set stripe_account_id = 'acct_bee', stripe_charges_enabled = true, stripe_payouts_enabled = true,
       stripe_details_submitted = true, stripe_connected_at = now(), plan = 'school', founding_offer = true
 where id = :'school';
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type', now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 0, 'completed', 'paid_card', 4200, 'instructor')
returning id as lesson \gset
insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, method, status, paid_at)
values (:'school', :'lee', :'lesson', 'stripe', 4200, 'card', 'paid', now() - interval '2 days');
select tests.create_user_with_id(:'staff', 'super@test.local', 'Sue Super');
insert into public.platform_staff (user_id, role) values (:'staff', 'super_admin');

select (now() - interval '7 days')::text as week_from \gset
select (now() + interval '1 day')::text as week_to \gset

-- ---------------------------------------------------------------------------------------
-- The manager.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'mia');
select lives_ok(
  format($$ select name, stripe_account_id, stripe_charges_enabled, settings from public.businesses where id = %L $$, :'school'),
  'a manager still reads the school and whether it takes cards'
);
select throws_ok(
  format($$ select stripe_payouts_enabled from public.businesses where id = %L $$, :'school'),
  '42501', null, 'but not whether it pays out (acceptance test 11)'
);
select throws_ok(
  format($$ select stripe_details_submitted, stripe_connected_at from public.businesses where id = %L $$, :'school'),
  '42501', null, 'nor anything else about the payout account'
);
select throws_ok(
  format($$ select plan, plan_expires_at, founding_offer from public.businesses where id = %L $$, :'school'),
  '42501', null, 'nor the plan it pays for'
);
select throws_ok(format($$ select * from public.businesses where id = %L $$, :'school'), '42501', null, 'nor all of it at once');
select throws_ok(format($$ select * from public.payments_account(%L) $$, :'school'), '42501', null, 'the payments account is the owner''s to read');
select throws_ok(format($$ select * from public.business_billing(%L) $$, :'school'), '42501', null, 'and so is the billing');
select throws_ok(
  format($$ select public.set_payments_account(%L, 'acct_mia') $$, :'school'),
  '42501', null, 'and a manager connects no account of their own'
);
select results_eq(
  format($$ select s -> 'paid' = 'null'::jsonb, s -> 'credit_sold' = 'null'::jsonb, s -> 'refunds' = 'null'::jsonb, (s -> 'unpaid') is not null
              from (select public.money_summary(%L, %L, %L) as s) as x $$, :'school', :'week_from', :'week_to'),
  $$ values (true, true, true, true) $$,
  'the Money screen tells a manager what is unpaid, but not what the school took (PRD 6.2)'
);

select tests.clear_authentication();
update public.memberships set permissions = '{"view_revenue": true}' where business_id = :'school' and user_id = :'mia';
select tests.authenticate_as(:'mia');
select is(
  (select (public.money_summary(:'school', :'week_from', :'week_to') -> 'paid' ->> 'total_pence')::int),
  4200,
  'until the owner lets them see revenue'
);
select throws_ok(format($$ select * from public.payments_account(%L) $$, :'school'), '42501', null, 'which still shows no payouts');

-- ---------------------------------------------------------------------------------------
-- Everybody else.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select throws_ok(format($$ select * from public.payments_account(%L) $$, :'school'), '42501', null, 'an instructor at the school reads no payouts');
select is(
  (select (public.money_summary(:'school', :'week_from', :'week_to') -> 'paid' ->> 'total_pence')::int),
  4200,
  'but sees what their own lessons took'
);

select tests.authenticate_as(:'ben');
select results_eq(
  format($$ select account_id, payouts_enabled, details_submitted, connected_at is not null from public.payments_account(%L) $$, :'school'),
  $$ values ('acct_bee'::text, true, true, true) $$,
  'the owner reads the payments account and its payouts'
);
select results_eq(
  format($$ select plan::text, founding_offer from public.business_billing(%L) $$, :'school'),
  $$ values ('school'::text, true) $$,
  'and the plan'
);
select is(
  (select (public.money_summary(:'school', :'week_from', :'week_to') -> 'paid' ->> 'total_pence')::int),
  4200,
  'and what the school took'
);

select tests.authenticate_as(:'staff');
select throws_ok(format($$ select * from public.payments_account(%L) $$, :'school'), '42501', null, 'platform staff need their second step first');
select tests.authenticate_as(:'staff', 'aal2');
select lives_ok(format($$ select * from public.payments_account(%L) $$, :'school'), 'and then a super admin may look');

select tests.authenticate_as_anon();
select throws_ok(format($$ select * from public.business_billing(%L) $$, :'school'), '42501', null, 'nobody signed out reads any of it');

select * from finish();
rollback;
