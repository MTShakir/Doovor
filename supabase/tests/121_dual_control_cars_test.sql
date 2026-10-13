-- A car with dual controls is claimed on what it costs, never by the mile (MNY-03, D-256).
begin;
select plan(10);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'

select tests.authenticate_as(:'asha');
select public.add_vehicle(:'asha_business', 'Ford', 'Fiesta', 2021, 'DC21 AAA', true) as fiesta \gset
select public.add_vehicle(:'asha_business', 'Toyota', 'Yaris', 2020, 'AB12 CDE', false) as yaris \gset
select public.add_vehicle(:'asha_business', 'Honda') as jazz \gset

-- ---------------------------------------------------------------------------------------
-- The answer settles how the car is claimed, as it arrives.
-- ---------------------------------------------------------------------------------------
select results_eq(
  format($$ select dual_controls, claim_method::text, method_settled_at is not null from public.vehicles where id = %L $$, :'fiesta'),
  $$ values (true, 'actual_costs', true) $$,
  'a car with dual controls is claimed on what it costs from the moment it is added'
);
select results_eq(
  format($$ select dual_controls, claim_method::text from public.vehicles where id = %L $$, :'yaris'),
  $$ values (false, null::text) $$,
  'a car without them is left for its first claim to settle'
);
select is(
  (select dual_controls from public.vehicles where id = :'jazz'),
  false,
  'and a car added without the answer is taken to have none'
);

-- ---------------------------------------------------------------------------------------
-- Its miles cannot be claimed, whichever way in.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.record_mileage(%L, %L, private.today(), 120) $$, :'asha_business', :'fiesta'),
  'P0001', 'CLAIMED_ON_COSTS',
  'a trip in a dual control car is refused'
);
select throws_ok(
  format($$ select public.set_vehicle_method(%L, 'mileage') $$, :'fiesta'),
  'P0001', 'METHOD_SETTLED',
  'and so is switching it to the mile'
);
select lives_ok(
  format($$ select public.record_expense(%L, 'fuel', private.today(), 5000, 0, null, null, %L) $$, :'asha_business', :'fiesta'),
  'what it costs to run is claimed instead'
);
select lives_ok(
  format($$ select public.record_mileage(%L, %L, private.today(), 120) $$, :'asha_business', :'yaris'),
  'while a car without dual controls can still be claimed by the mile'
);

select tests.clear_authentication();
select results_eq(
  format($$ select action, (after ->> 'because') from public.audit_log where entity_id = %L and action = 'vehicle.method_set' $$, :'fiesta'),
  $$ values ('vehicle.method_set', 'dual_controls') $$,
  'the record says why the car was settled as it was added'
);

-- Even a write that went round the functions could not claim one by the mile.
select throws_ok(
  format($$ update public.vehicles set claim_method = 'mileage' where id = %L $$, :'fiesta'),
  '23514', null,
  'the table refuses a dual control car claimed by the mile'
);
select throws_ok(
  format($$ insert into public.vehicles (business_id, make, dual_controls) values (%L, 'Kia', true) $$, :'asha_business'),
  '23514', null,
  'and one added with dual controls but nothing settled'
);

select * from finish();
rollback;
