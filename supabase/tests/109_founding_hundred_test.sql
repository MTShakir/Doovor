-- The founding offer is the first hundred instructors (D-203).
begin;
select plan(3);

select is(
  (select (value ->> 'instructor_limit')::int from public.platform_settings where key = 'founding_offer'),
  100,
  'a hundred instructors, not five hundred'
);
select is(
  (select (value ->> 'school_limit')::int from public.platform_settings where key = 'founding_offer'),
  50,
  'the schools number is left where it was'
);
select is(
  (select (value ->> 'months')::int from public.platform_settings where key = 'founding_offer'),
  12,
  'and it is still twelve months'
);

select * from finish();
rollback;
