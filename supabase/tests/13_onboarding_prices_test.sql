-- One question about price creates a lesson type, its prices and a package (R-05, PAY-04, M1-08).
begin;
select plan(11);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set bee_biz 'bbbb0000-0000-0000-0000-000000000000'
\set ian_user 'b0000000-0000-0000-0000-000000000003'

select tests.authenticate_as(:'asha_user');
select ok(
  public.set_onboarding_prices(:'asha_biz', 4200, 40000) is not null,
  'setting a price returns the lesson type it belongs to'
);
select is(
  (select count(*)::int from public.lesson_types where business_id = :'asha_biz' and kind = 'standard'),
  1,
  'a standard lesson type exists'
);
select is(
  (select price_pence from public.lesson_prices p join public.lesson_types t on t.id = p.lesson_type_id
    where t.business_id = :'asha_biz' and p.duration_minutes = 60),
  4200,
  'an hour costs what was asked for'
);
select is(
  (select price_pence from public.lesson_prices p join public.lesson_types t on t.id = p.lesson_type_id
    where t.business_id = :'asha_biz' and p.duration_minutes = 90),
  6300,
  'and an hour and a half starts proportional to it (R-05)'
);
select is(
  (select count(*)::int from public.lesson_prices p join public.lesson_types t on t.id = p.lesson_type_id
    where t.business_id = :'asha_biz'),
  3,
  'the three default durations are priced'
);
select is(
  (select price_pence from public.packages where business_id = :'asha_biz' and minutes = 600),
  40000,
  'the ten hour package is created (PAY-04)'
);

-- Setting prices again changes them rather than making a second set.
select ok(public.set_onboarding_prices(:'asha_biz', 4500, 43000) is not null, 'prices can be set again');
select is(
  (select count(*)::int from public.lesson_prices p join public.lesson_types t on t.id = p.lesson_type_id
    where t.business_id = :'asha_biz'),
  3,
  'which changes the prices rather than adding more'
);
select is(
  (select price_pence from public.packages where business_id = :'asha_biz' and minutes = 600),
  43000,
  'and the package keeps its place'
);

-- Who may do it
select throws_ok(
  format($$ select public.set_onboarding_prices(%L, 4000, null) $$, :'bee_biz'),
  '42501',
  'NOT_ALLOWED',
  'nobody sets prices for a business they are not in'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.set_onboarding_prices(%L, 4000, null) $$, :'bee_biz'),
  '42501',
  'NOT_ALLOWED',
  'and an instructor at a school does not set the school price (SCH-04)'
);

select * from finish();
rollback;
