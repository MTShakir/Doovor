-- What the platform itself earns (ADM-01, ADM-10, D-174).
begin;
select plan(8);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000011'
\set from_at '2021-03-01T00:00:00Z'
\set to_at '2021-04-01T00:00:00Z'

-- £420 through the school with £4.20 kept, £150 through Asha with 50p kept, a payment by credit,
-- which moved no money, and one the month before.
insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, fee_pence, method, status, paid_at) values
  (:'school', :'lee', null, 'stripe', 42000, 420, 'card', 'paid', '2021-03-05T11:00:00Z'),
  (:'asha_biz', :'lee', null, 'stripe', 15000, 50, 'card', 'paid', '2021-03-07T11:00:00Z'),
  (:'school', :'lou', null, 'offline', 9000, 0, 'credit', 'paid', '2021-03-08T11:00:00Z'),
  (:'school', :'lou', null, 'stripe', 20000, 200, 'card', 'paid', '2021-02-08T11:00:00Z');

update public.businesses set plan = 'pro' where id = :'asha_biz';

select private.platform_income_facts(:'from_at', :'to_at') as facts \gset

select is(
  (select (f #>> '{fees,pence}')::bigint from (select (:'facts')::jsonb as f) x),
  470::bigint,
  'the platform keeps its fee on the payments settled in those days, and nothing from the month before'
);
select is(
  (select (f #>> '{fees,payments}')::int from (select (:'facts')::jsonb as f) x),
  2,
  'counted over the payments that carried a fee'
);
select is(
  (select (f #>> '{fees,on_pence}')::bigint from (select (:'facts')::jsonb as f) x),
  57000::bigint,
  'with the money those payments moved, so a rate can be seen'
);
select is(
  (select (f #>> '{by_business,0,name}') from (select (:'facts')::jsonb as f) x),
  'Bee School',
  'whoever paid the most in fees is first'
);
select is(
  (select (f #>> '{by_business,1,plan}') from (select (:'facts')::jsonb as f) x),
  'pro',
  'and each is shown with the plan it is on, which staff cannot read from the table itself'
);
select is(
  (select jsonb_array_length(f -> 'by_business') from (select (:'facts')::jsonb as f) x),
  2,
  'a Business whose payments carried no fee is not in the list'
);

-- ---------------------------------------------------------------------------------------
-- Who may read it.
-- ---------------------------------------------------------------------------------------
select tests.create_user_with_id(:'staff', 'support.income@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');
select tests.authenticate_as(:'staff', 'aal2');
select lives_ok(
  format($$ select public.platform_income(%L, %L) $$, :'from_at', :'to_at'),
  'platform staff past their second step see what the platform earned'
);
select tests.authenticate_as(:'ben', 'aal2');
select throws_ok(
  format($$ select public.platform_income(%L, %L) $$, :'from_at', :'to_at'),
  '42501', 'NOT_ALLOWED', 'the owner of a school does not'
);

select * from finish();
rollback;
