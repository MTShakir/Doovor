-- Receipts (PAY-08, M3-20).
begin;
select plan(14);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'

select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_receipts');
select tests.clear_authentication();
select public.system_set_payments_state('acct_receipts', true, true, true);

update public.businesses
   set address = '{"line1": "4 Quay Street", "town": "Manchester", "postcode": "M1 2QF"}'::jsonb, vat_number = null
 where id = :'school';

create or replace function pg_temp.lesson(p_hours integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values ('bbbb0000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001',
          now() + make_interval(hours => p_hours), now() + make_interval(hours => p_hours, mins => 90), 30,
          'confirmed', 6200, 'instructor')
  returning id;
$$;

create or replace function pg_temp.paid_by_card(p_booking uuid, p_intent text)
returns uuid language plpgsql as $$
begin
  perform public.system_process_stripe_event('evt_' || p_intent, 'payment_intent.succeeded', 'acct_receipts',
    jsonb_build_object('id', p_intent, 'amount_received', 6200, 'metadata', jsonb_build_object('booking_id', p_booking)));
  return (select id from public.payments where provider_ref = p_intent);
end;
$$;

-- ---------------------------------------------------------------------------------------
-- A lesson paid by card, at a Business not registered for VAT.
-- ---------------------------------------------------------------------------------------
select pg_temp.lesson(30) as first_lesson \gset
select pg_temp.paid_by_card(:'first_lesson', 'pi_receipt_1') as first_payment \gset
select public.system_issue_receipt(:'first_payment') as first_receipt \gset

select results_eq(
  format($$ select (r ->> 'number')::int, r ->> 'kind', (r ->> 'amount_pence')::int, r ->> 'method', r ->> 'business_name',
                   r -> 'business_address' ->> 'postcode', r ->> 'vat_number', r ->> 'vat_pence', (r ->> 'lesson_minutes')::int,
                   r ->> 'lesson_type', r ->> 'instructor_name', r ->> 'learner_email' is not null
              from (select %L::jsonb as r) as receipt $$, :'first_receipt'),
  $$ values (1, 'lesson', 6200, 'card', 'Bee School', 'M1 2QF', null::text, null::text, 90, 'Standard lesson', 'Ian', true) $$,
  'a lesson paid by card gets receipt number 1, with the Business, the lesson and no VAT (PAY-08)'
);

select is(
  public.system_issue_receipt(:'first_payment') ->> 'id',
  :'first_receipt'::jsonb ->> 'id',
  'asking again answers with the same receipt, and spends no number'
);

-- ---------------------------------------------------------------------------------------
-- Registered for VAT: the VAT in the price, to the penny.
-- ---------------------------------------------------------------------------------------
update public.businesses set vat_number = ' GB123456789 ' where id = :'school';
select pg_temp.lesson(40) as vat_lesson \gset
select pg_temp.paid_by_card(:'vat_lesson', 'pi_receipt_2') as vat_payment \gset
select public.system_issue_receipt(:'vat_payment') as vat_receipt \gset

select results_eq(
  format($$ select (r ->> 'number')::int, r ->> 'vat_number', (r ->> 'vat_rate_percent')::int, (r ->> 'vat_pence')::int
              from (select %L::jsonb as r) as receipt $$, :'vat_receipt'),
  $$ values (2, 'GB123456789', 20, 1033) $$,
  'at a Business registered for VAT the receipt is number 2 and shows the VAT in £62: £10.33 at 20% (PAY-08)'
);

select is(
  (select vat_number from public.receipts where id = (:'first_receipt'::jsonb ->> 'id')::uuid),
  null,
  'and a receipt already issued keeps what it said: it does not gain VAT'
);

-- ---------------------------------------------------------------------------------------
-- Credit, fees, and money recorded in person.
-- ---------------------------------------------------------------------------------------
update public.businesses set vat_number = null where id = :'school';
insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at, provider)
values (:'school', :'lee', 38000, 'card', 'paid', now(), 'stripe') returning id as package_payment \gset
insert into public.credit_accounts (business_id, learner_id) values (:'school', :'lee') on conflict do nothing;
insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence)
values (:'school', :'lee', :'package_payment', 600, 38000) returning id as lot \gset
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
values (:'school', :'lee', :'lot', 'purchase', 600, :'package_payment');

select results_eq(
  format($$ select r ->> 'kind', (r ->> 'credit_minutes')::int, (r ->> 'number')::int
              from (select public.system_issue_receipt(%L) as r) as receipt $$, :'package_payment'),
  $$ values ('credit', 600, 3) $$,
  'a package gets a receipt for the credit it bought'
);

select pg_temp.lesson(-3) as missed \gset
select tests.authenticate_as(:'ian_user');
select public.mark_no_show(:'missed');
select tests.clear_authentication();
select pg_temp.paid_by_card(:'missed', 'pi_receipt_fee') as fee_payment \gset
select is(
  public.system_issue_receipt(:'fee_payment') ->> 'kind',
  'no_show_fee',
  'a no-show fee paid by card gets a receipt for the fee, not the lesson'
);

select pg_temp.lesson(50) as in_person \gset
select tests.authenticate_as(:'ian_user');
select public.record_offline_payment(:'in_person', 'cash') as cash_payment \gset
select tests.clear_authentication();

select ok(
  (public.system_issue_receipt(:'cash_payment') ->> 'wait_until')::timestamptz = now() + interval '10 minutes',
  'cash recorded in the last ten minutes waits, while it can still be taken back out (D-089)'
);
select is(
  (select count(*)::int from public.receipts where payment_id = :'cash_payment'),
  0,
  'and has no receipt, and no number, yet'
);

update public.payments set created_at = now() - interval '11 minutes' where id = :'cash_payment';
select results_eq(
  format($$ select r ->> 'method', (r ->> 'number')::int from (select public.system_issue_receipt(%L) as r) as receipt $$, :'cash_payment'),
  $$ values ('cash', 5) $$,
  'after that it gets the next number, with no gap left by the one that waited'
);

select is(public.system_issue_receipt(gen_random_uuid()), null, 'a payment that does not exist has no receipt');

-- ---------------------------------------------------------------------------------------
-- Who reads them.
-- ---------------------------------------------------------------------------------------
select ok(public.system_mark_receipt_emailed((:'first_receipt'::jsonb ->> 'id')::uuid), 'emailing a receipt is recorded');
select is(public.system_mark_receipt_emailed((:'first_receipt'::jsonb ->> 'id')::uuid), false, 'once');

select tests.authenticate_as(:'lee');
select is((select count(*)::int from public.receipts), 5, 'the learner reads their receipts');
select tests.authenticate_as(:'lou');
select is((select count(*)::int from public.receipts where learner_id = :'lee'), 0, 'another learner reads none of them');
select tests.clear_authentication();

select * from finish();
rollback;
