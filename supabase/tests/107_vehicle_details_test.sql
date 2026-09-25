-- What a car is, and putting one away (MNY-03, D-199).
begin;
select plan(11);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'

select tests.authenticate_as(:'asha');
select public.add_vehicle(:'asha_business', 'Toyota', 'Yaris', 2020, 'AB12 CDE') as yaris \gset

select results_eq(
  format($$ select make, model, year, registration from public.vehicles where id = %L $$, :'yaris'),
  $$ values ('Toyota', 'Yaris', 2020, 'AB12CDE') $$,
  'a car is what it is, and its plate is stored without the space'
);

-- ---------------------------------------------------------------------------------------
-- One plate, one car.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.add_vehicle(%L, 'Vauxhall', 'Corsa', 2019, 'ab12cde') $$, :'asha_business'),
  'P0001', 'DUPLICATE_VEHICLE',
  'the same plate typed differently is the same car, and is refused'
);
select lives_ok(
  format($$ select public.add_vehicle(%L, 'Vauxhall', 'Corsa', 2019, 'CD34 EFG') $$, :'asha_business'),
  'a different plate is a different car'
);

-- ---------------------------------------------------------------------------------------
-- What it refuses.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.add_vehicle(%L, '   ') $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'a car with no make is refused'
);
select throws_ok(
  format($$ select public.add_vehicle(%L, 'Toyota', 'Yaris', 1066) $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'and one built before cars were'
);
select throws_ok(
  format($$ select public.add_vehicle(%L, 'Toyota', 'Yaris', 2020, 'NOT A PLATE AT ALL') $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'and a plate too long to be one'
);

-- ---------------------------------------------------------------------------------------
-- Retiring keeps the history.
-- ---------------------------------------------------------------------------------------
select public.record_expense(:'asha_business', 'servicing', private.today() - 5, 18000, 0, null, null, :'yaris');

select lives_ok(format($$ select public.retire_vehicle(%L) $$, :'yaris'), 'a car can be retired');
select isnt((select retired_at from public.vehicles where id = :'yaris'), null, 'and it says when');
select is(
  (select count(*)::int from public.expenses where vehicle_id = :'yaris'),
  1,
  'what was claimed against it stays, because that is a financial record'
);
select lives_ok(format($$ select public.retire_vehicle(%L) $$, :'yaris'), 'retiring it twice is retiring it once');

-- Its plate is free again, because a retired car is no longer one of the cars.
select lives_ok(
  format($$ select public.add_vehicle(%L, 'Toyota', 'Yaris', 2024, 'AB12CDE') $$, :'asha_business'),
  'and the plate can be used again once the car is gone'
);

select tests.clear_authentication();
select * from finish();
rollback;
