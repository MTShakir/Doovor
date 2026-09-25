-- Business miles, and whether a Business charges VAT (MNY-03, MNY-02, D-198).
begin;
select plan(16);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, payment_status, price_pence, source)
values (:'asha_business', 'a1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'a2000000-0000-0000-0000-000000000001', now() - interval '2 days', now() - interval '2 days' + interval '1 hour',
        0, 'completed', 'paid_cash', 4200, 'instructor')
returning id as lesson \gset

select tests.authenticate_as(:'asha');
select public.add_vehicle(:'asha_business', 'Vauxhall', 'Corsa', 2019, 'LS06ADI') as corsa \gset
select public.add_vehicle(:'asha_business', 'Ford', 'Transit', 2021, 'VN21VAN') as van \gset

-- ---------------------------------------------------------------------------------------
-- The first claim decides how a car is claimed from then on.
-- ---------------------------------------------------------------------------------------
select public.record_mileage(:'asha_business', :'corsa', private.today() - 1, 75) as trip \gset
select is(
  (select claim_method::text from public.vehicles where id = :'corsa'),
  'mileage',
  'recording miles against a car settles it on the mileage rate (MNY-03)'
);
select is((select miles_tenths from public.mileage_log where id = :'trip'), 75, 'and the trip is kept in tenths of a mile');

select throws_ok(
  format($$ select public.record_expense(%L, 'fuel', private.today(), 5000, 0, null, null, %L) $$, :'asha_business', :'corsa'),
  'P0001', 'CLAIMED_BY_MILEAGE',
  'so its fuel cannot be claimed as well'
);

-- The other way round: a running cost settles the other car on actual costs.
select public.record_expense(:'asha_business', 'servicing', private.today() - 2, 18000, 0, null, null, :'van');
select is(
  (select claim_method::text from public.vehicles where id = :'van'),
  'actual_costs',
  'recording what a car costs to run settles it on actual costs'
);
select throws_ok(
  format($$ select public.record_mileage(%L, %L, private.today(), 120) $$, :'asha_business', :'van'),
  'P0001', 'CLAIMED_ON_COSTS',
  'and that car cannot then be claimed by the mile'
);

-- ---------------------------------------------------------------------------------------
-- A lesson's miles are recorded once.
-- ---------------------------------------------------------------------------------------
select public.record_mileage(:'asha_business', :'corsa', private.today() - 2, 120, :'lesson');
select public.record_mileage(:'asha_business', :'corsa', private.today() - 2, 140, :'lesson');
select results_eq(
  format($$ select count(*)::int, max(miles_tenths) from public.mileage_log where booking_id = %L $$, :'lesson'),
  $$ values (1, 140) $$,
  'recording a lesson a second time replaces the first rather than doubling it'
);

select throws_ok(
  format($$ select public.record_mileage(%L, %L, private.today() + 1, 100) $$, :'asha_business', :'corsa'),
  'P0001', 'VALIDATION_FAILED', 'miles driven tomorrow are refused'
);
select throws_ok(
  format($$ select public.record_mileage(%L, %L, private.today(), 0) $$, :'asha_business', :'corsa'),
  'P0001', 'VALIDATION_FAILED', 'and so is a trip of no distance'
);

select lives_ok(format($$ select public.remove_mileage(%L) $$, :'trip'), 'a trip can be taken back out');
select is((select count(*)::int from public.mileage_log where id = :'trip'), 0, 'and it is gone');

-- ---------------------------------------------------------------------------------------
-- VAT: asked, and answered.
-- ---------------------------------------------------------------------------------------
select is(
  (select vat_registered from public.businesses where id = :'asha_business'),
  false,
  'a Business is not registered for VAT until it says it is'
);
select is(
  (public.set_vat_registration(:'asha_business', true, 'GB 123 4567 89', private.today()) ->> 'number'),
  '123456789',
  'a number is taken however it is written down, and kept as nine digits'
);
select results_eq(
  format($$ select vat_registered, vat_number from public.businesses where id = %L $$, :'asha_business'),
  $$ values (true, '123456789') $$,
  'and the Business says so from then on'
);
select throws_ok(
  format($$ select public.set_vat_registration(%L, true, '12345') $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'a number that is not a VAT number is refused'
);
select is(
  (public.set_vat_registration(:'asha_business', false) ->> 'number'),
  null,
  'and saying no again clears the number rather than leaving it behind'
);

-- ---------------------------------------------------------------------------------------
-- Nobody else.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'mia');
select throws_ok(
  format($$ select public.set_vat_registration(%L, true, '123456789') $$, :'school'),
  '42501', null, 'a manager does not answer for the school'
);
select tests.clear_authentication();

select * from finish();
rollback;
