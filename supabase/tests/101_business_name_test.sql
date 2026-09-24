-- What an instructor trades as, which is not their own name (INS-01, D-196).
begin;
select plan(7);

select tests.create_fixture();

\set asha 'a0000000-0000-0000-0000-000000000001'
\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set mia 'b0000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'

-- The booking link as it stands, to compare with after the change.
select slug as slug_before from public.businesses where id = :'asha_business' \gset

-- ---------------------------------------------------------------------------------------
-- The owner renames their own business.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');
select is(public.set_business_name(:'asha_business', '  Perfect Driving  '), 'Perfect Driving', 'the name is trimmed and saved');
select is(
  (select name from public.businesses where id = :'asha_business'),
  'Perfect Driving',
  'and that is what the Business is called from now on'
);
select is(
  (select slug from public.businesses where id = :'asha_business'),
  :'slug_before',
  'the booking link already given out still works, so the slug does not follow the name'
);
select tests.clear_authentication();
select is(
  (select count(*)::int from public.audit_log
    where action = 'business.renamed' and business_id = :'asha_business' and after ->> 'name' = 'Perfect Driving'),
  1,
  'and the change is written down'
);
select tests.authenticate_as(:'asha');

-- ---------------------------------------------------------------------------------------
-- Nobody else, and nothing silly.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ select public.set_business_name(%L, '  ') $$, :'asha_business'),
  'P0001', 'VALIDATION_FAILED', 'a name of nothing at all is refused'
);
select tests.authenticate_as(:'mia');
select throws_ok(
  format($$ select public.set_business_name(%L, 'Mia Motors') $$, :'school'),
  '42501', null, 'a manager does not rename the school they work for'
);
select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select public.set_business_name(%L, 'Lee Driving') $$, :'school'),
  '42501', null, 'and neither does a learner'
);
select tests.clear_authentication();

select * from finish();
rollback;
