-- An instructor's books survive their account, because HMRC says so (NFR-PRV-03, MNY-02, D-198).
--
-- Deleting an account takes the person out of the financial records rather than the records out of
-- the product (D-149). The books are financial records, so the same rule has to hold for them: the
-- expense and the trip stay, and the person who recorded them is nobody afterwards.
begin;
select plan(6);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'

select tests.authenticate_as(:'asha');
select public.add_vehicle(:'asha_business', 'LS06 ADI') as corsa \gset
select public.record_expense(:'asha_business', 'franchise_fee', current_date - 10, 30000) as spend \gset
select public.record_mileage(:'asha_business', :'corsa', current_date - 10, 250) as trip \gset
select tests.clear_authentication();

select is((select created_by from public.expenses where id = :'spend'), :'asha'::uuid, 'an expense is recorded against whoever recorded it');

-- The job runner erases the account.
select public.system_erase_account(:'asha');

select is((select count(*)::int from public.expenses where id = :'spend'), 1, 'the expense stays, because it is a financial record');
select is((select amount_pence from public.expenses where id = :'spend'), 30000, 'and it still says what it was');
select is((select count(*)::int from public.mileage_log where id = :'trip'), 1, 'the trip stays too, because it is part of the same claim');
select is((select count(*)::int from public.vehicles where id = :'corsa'), 1, 'and so does the car they were claimed against');

-- The row the expense points at is still there, and there is no longer a person in it.
select is(
  (select u.full_name from public.users u join public.expenses e on e.created_by = u.id where e.id = :'spend'),
  'Deleted account',
  'but whoever recorded it is nobody now'
);

select * from finish();
rollback;
