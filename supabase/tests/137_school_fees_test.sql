-- Fees fall due on their schedule, once each, and the school marks them paid or written off
-- (M9-12, M9-13, D-287). Dates are counted from today, so the test means the same on any day.
begin;
select plan(24);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'

insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');
select id as link from public.school_links where business_id = :'asha_biz' \gset
-- The arrangement starts a fortnight from today, at £50 a week with the first week free.
select (private.today() + 14)::text as base \gset

select tests.authenticate_as(:'ben');
select public.set_school_fee_terms(:'link', 'weekly', 5000, :'base'::date, 1, null);
reset role;

select is(public.system_raise_school_fees(:'base'::date - 1), 0, 'nothing is due before the arrangement starts');
select is(public.system_raise_school_fees(:'base'::date + 6), 0, 'nor in the free week');
select is(public.system_raise_school_fees(:'base'::date + 7), 1, 'the first fee falls due when the free week is over');
select is(public.system_raise_school_fees(:'base'::date + 7), 0, 'and only once, however often the job runs');
select is(public.system_raise_school_fees(:'base'::date + 28), 3, 'a job that runs late catches up, a fee for each week');
select is(
  (select array_agg(to_char(period_starts_on - :'base'::date, 'FM99') || ':' || amount_pence order by period_starts_on)
     from public.school_fees where link_id = :'link'),
  array['7:5000', '14:5000', '21:5000', '28:5000'],
  'across the month, four weeks at £50, the free one left out'
);
select is(
  (select array[period_ends_on - period_starts_on, (due_on = period_starts_on)::int] from public.school_fees
    where link_id = :'link' order by period_starts_on limit 1),
  array[6, 1],
  'each covers a week and is due as it starts'
);

-- A new amount applies from the next fee.
select tests.authenticate_as(:'ben');
select public.set_school_fee_terms(:'link', 'weekly', 6000, :'base'::date, 1, null);
reset role;
select is(public.system_raise_school_fees(:'base'::date + 35), 1, 'the next week falls due');
select is(
  (select array_agg(amount_pence order by period_starts_on) from public.school_fees where link_id = :'link'),
  array[5000, 5000, 5000, 5000, 6000],
  'at the new amount, and the weeks before keep theirs'
);

-- Monthly from the day after the last week, and never overlapping it.
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'monthly', 20000, %L::date + 40) $$, :'link', :'base'),
  'VALIDATION_FAILED',
  'a monthly fee cannot start inside a week already charged'
);
select lives_ok(
  format($$ select public.set_school_fee_terms(%L, 'monthly', 20000, %L::date + 42) $$, :'link', :'base'),
  'it starts the day after'
);
reset role;
select is(
  public.system_raise_school_fees((:'base'::date + 42 + interval '2 months')::date),
  3,
  'three months begun, three fees'
);
select is(
  (select array_agg(to_char(period_ends_on + 1, 'YYYY-MM-DD') = to_char((period_starts_on + interval '1 month')::date, 'YYYY-MM-DD')
                    order by period_starts_on)
     from public.school_fees where link_id = :'link' and amount_pence = 20000),
  array[true, true, true],
  'each covering a calendar month'
);

-- Once the link ends, no more fall due; those owed stay owed.
update public.school_links set status = 'ended', ended_at = (:'base'::date + 42 + interval '2 months 10 days')::timestamptz,
                              end_reason = 'let_go', ended_by = :'ben'
 where id = :'link';
select is(public.system_raise_school_fees((:'base'::date + 42 + interval '6 months')::date), 0, 'a link that has ended raises nothing more');

-- Who reads them: the school and the instructor, nobody else.
select tests.authenticate_as(:'ben');
select is((select count(*)::int from public.school_fees where link_id = :'link'), 8, 'the school reads every fee');
select tests.authenticate_as(:'asha_user');
select is((select count(*)::int from public.school_fees where link_id = :'link'), 8, 'and so does the instructor');
select tests.authenticate_as(:'ian_user');
select is((select count(*)::int from public.school_fees where link_id = :'link'), 0, 'an instructor at the school does not');
select tests.authenticate_as(:'otto');
select is((select count(*)::int from public.school_fees where link_id = :'link'), 0, 'nor does anybody else');

-- The school marks a fee paid outside the platform, writes one off, and puts one back.
reset role;
select id as first_fee from public.school_fees where link_id = :'link' order by period_starts_on limit 1 \gset
select id as second_fee from public.school_fees where link_id = :'link' order by period_starts_on offset 1 limit 1 \gset
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.settle_school_fee(%L, 'paid') $$, :'first_fee'),
  'NOT_ALLOWED',
  'the instructor cannot mark her own fee paid'
);
select tests.authenticate_as(:'ben');
select public.settle_school_fee(:'first_fee', 'paid', 'Bank transfer');
select is(
  (select status::text || ' ' || settled_note from public.school_fees where id = :'first_fee'),
  'paid Bank transfer',
  'the school marks it paid, and says how'
);
select public.settle_school_fee(:'second_fee', 'written_off');
select public.settle_school_fee(:'second_fee', 'owed');
select is(
  (select array[status::text, coalesce(settled_at::text, 'none')] from public.school_fees where id = :'second_fee'),
  array['owed', 'none'],
  'a fee written off by mistake is owed again'
);

reset role;
select is(
  -- One transaction, so one time: the three in order of their words.
  (select array_agg(after ->> 'status' order by after ->> 'status') from public.audit_log
    where action = 'school.fee_settled' and business_id = :'school'),
  array['owed', 'paid', 'written_off'],
  'each is written down'
);

select tests.authenticate_as(:'ben');
select throws_ok(
  $$ select public.system_raise_school_fees() $$,
  '42501',
  null,
  'only the job raises fees'
);
reset role;
select is(
  (select schedule from cron.job where jobname = 'raise-school-fees'),
  '7 * * * *',
  'which runs every hour'
);

select * from finish();
rollback;
