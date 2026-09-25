-- An instructor's books: what they spent, and which car it was for (MNY-02, MNY-03, D-198).
begin;
select plan(20);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set lee 'c0000000-0000-0000-0000-000000000001'

select has_table('public', 'expenses', 'there is a table of expenses');
select has_table('public', 'vehicles', 'and one of vehicles');

-- ---------------------------------------------------------------------------------------
-- A solo instructor keeps their own books.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');
select public.add_vehicle(:'asha_business', '  Vauxhall  ', 'Corsa', 2019, 'ls06 adi') as corsa \gset
select results_eq(
  format($$ select make, model, year, registration from public.vehicles where id = %L $$, :'corsa'),
  $$ values ('Vauxhall', 'Corsa', 2019, 'LS06ADI') $$,
  'a car is added as what it is, trimmed, and its plate is stored without its space'
);
select is(
  (select claim_method::text from public.vehicles where id = :'corsa'),
  null,
  'and how it is claimed is not settled until it is chosen'
);

-- Against no car in particular, so the corsa's method is still a choice further down: the
-- first running cost recorded against a car settles it on actual costs (see 103).
select public.record_expense(:'asha_business', 'fuel', private.today() - 3, 6500, 0, 'Filled up before the test') as fuel \gset
select is(
  (select amount_pence from public.expenses where id = :'fuel'),
  6500,
  'an expense is recorded in pence, against the day it went out'
);
select is(
  (select created_by from public.expenses where id = :'fuel'),
  :'asha'::uuid,
  'and against whoever recorded it'
);

-- ---------------------------------------------------------------------------------------
-- The mileage rule: a car claimed by the mile cannot also claim what it costs to run.
-- ---------------------------------------------------------------------------------------
select is(public.set_vehicle_method(:'corsa', 'mileage'), 'mileage', 'how a vehicle is claimed is settled once');
select lives_ok(
  format($$ select public.set_vehicle_method(%L, 'mileage') $$, :'corsa'),
  'settling it again the same way changes nothing and complains about nothing'
);
select throws_ok(
  format($$ select public.set_vehicle_method(%L, 'actual_costs') $$, :'corsa'),
  'P0001', 'METHOD_SETTLED',
  'but it cannot be changed to the other, because HMRC only allows that when the car is replaced'
);
select throws_ok(
  format($$ select public.record_expense(%L, 'fuel', private.today(), 5000, 0, null, null, %L) $$, :'asha_business', :'corsa'),
  'P0001', 'CLAIMED_BY_MILEAGE',
  'and its running costs cannot be claimed as well, which would count the same money twice'
);
select lives_ok(
  format($$ select public.record_expense(%L, 'training', private.today(), 12000, 0, null, null, %L) $$, :'asha_business', :'corsa'),
  'something that is not a running cost is still fine against that car'
);

-- ---------------------------------------------------------------------------------------
-- What the books refuse.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.record_expense(%L, 'yacht', private.today(), 5000) $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'a category the books do not know is refused'
);
select throws_ok(
  format($$ select public.record_expense(%L, 'fuel', private.today() + 1, 5000) $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'so is money that goes out tomorrow'
);
select throws_ok(
  format($$ select public.record_expense(%L, 'fuel', private.today(), 0) $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'and an expense of nothing'
);
select throws_ok(
  format($$ select public.record_expense(%L, 'fuel', private.today(), 5000, 6000) $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'and VAT larger than the amount it is inside'
);

-- ---------------------------------------------------------------------------------------
-- Taking one back out.
-- ---------------------------------------------------------------------------------------
select is(
  (public.remove_expense(:'fuel') ->> 'receipt_path'),
  null,
  'removing an expense hands back the picture to delete with it'
);
select is((select count(*)::int from public.expenses where id = :'fuel'), 0, 'and it is gone from the books');

-- ---------------------------------------------------------------------------------------
-- Nobody else, and no school yet.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.add_vehicle(%L, 'Ford', 'Focus') $$, :'school'),
  '42501', null,
  'a school owner cannot keep books yet: it is coming soon, and not only on screen'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.record_expense(%L, 'fuel', private.today(), 5000) $$, :'asha_business'),
  '42501', null, 'an instructor at another Business cannot write to these books'
);
select tests.authenticate_as(:'lee');
select is(
  (select count(*)::int from public.expenses),
  0,
  'and a learner reads none of them at all'
);
select tests.clear_authentication();

select * from finish();
rollback;
