-- The day the product runs on is a day in the United Kingdom, not a day in UTC (M6-06, D-141).
begin;
select plan(5);

select is(private.today(), (now() at time zone 'Europe/London')::date, 'today is today in London');

-- Through British Summer Time, between midnight in London and midnight in UTC, they differ.
select is(
  (timestamptz '2026-07-01 23:30:00+00' at time zone 'Europe/London')::date,
  date '2026-07-02',
  'half past eleven in UTC on the first of July is already the second in London'
);
select isnt(
  (timestamptz '2026-07-01 23:30:00+00' at time zone 'Europe/London')::date,
  (timestamptz '2026-07-01 23:30:00+00' at time zone 'UTC')::date,
  'which is a different day from the one UTC is on'
);

-- Nothing works the day out for itself any more, so the hour above cannot come back.
select is(
  (
    select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prosrc like '%current_date%'
  ),
  '',
  'no function in public or private decides a day from current_date'
);

-- The same for a default argument, which is not in the body.
select is(
  (
    select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and pg_get_expr(p.proargdefaults, 0) like '%CURRENT_DATE%'
  ),
  '',
  'and none takes one as a default'
);

select * from finish();
rollback;
