-- A year's trading, gathered from the books (MNY-04, D-198).
begin;
select plan(8);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'

-- Two payments inside the 2026 to 2027 tax year, one outside it, and a refund inside.
insert into public.payments (business_id, learner_id, provider, provider_ref, amount_pence, method, status, paid_at, provider_fee_pence)
values (:'asha_business', :'lee', 'stripe', 'pi_in_1', 4200, 'card', 'paid', '2026-06-01T10:00:00Z', 83),
       (:'asha_business', :'lee', 'offline', null, 4000, 'cash', 'paid', '2026-07-01T10:00:00Z', null),
       (:'asha_business', :'lee', 'stripe', 'pi_out', 9900, 'card', 'paid', '2027-05-01T10:00:00Z', 168);

insert into public.refunds (business_id, learner_id, kind, provider, amount_pence, reason, status, settled_at)
values (:'asha_business', :'lee', 'card', 'stripe', 1200, 'Lesson cut short', 'succeeded', '2026-08-01T10:00:00Z');

select tests.authenticate_as(:'asha');
select public.add_vehicle(:'asha_business', 'Vauxhall', 'Corsa', 2019, 'LS06ADI') as corsa \gset
select public.record_mileage(:'asha_business', :'corsa', '2026-09-01', 1200);
select public.record_expense(:'asha_business', 'franchise_fee', '2026-05-01', 30000, 5000);
select public.record_expense(:'asha_business', 'phone', '2026-05-02', 2400, 400);
-- Outside the year, so none of it counts.
select public.record_expense(:'asha_business', 'phone', '2025-06-02', 9999, 0);

select public.books_year(:'asha_business', '2026-04-06', '2027-04-05') as year \gset
select tests.clear_authentication();

select is(((:'year'::jsonb) -> 'payments' ->> 'total_pence')::int, 8200, 'only the money taken inside the year counts');
select is(((:'year'::jsonb) -> 'refunds' ->> 'total_pence')::int, 1200, 'and the money given back inside it');
select is(((:'year'::jsonb) -> 'provider_fees' ->> 'total_pence')::int, 83, 'what the provider kept out of the payments in the year');
select is(
  ((:'year'::jsonb) -> 'provider_fees' ->> 'unknown_count')::int,
  0,
  'a cash payment is not a card fee nobody has asked about'
);
select is(((:'year'::jsonb) -> 'mileage' ->> 'tenths')::int, 1200, 'the miles driven by a car claimed by the mile');
select is(jsonb_array_length((:'year'::jsonb) -> 'expenses'), 2, 'the expenses of the year, by category, and none from another year');
select is(((:'year'::jsonb) ->> 'vat_registered')::boolean, false, 'and whether the Business charges VAT');

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.books_year(%L, '2026-04-06', '2027-04-05') $$, :'asha_business'),
  '42501', null, 'nobody reads books that are not theirs'
);
select tests.clear_authentication();

select * from finish();
rollback;
