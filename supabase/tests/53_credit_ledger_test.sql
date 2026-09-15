-- Lesson credit: the ledger is the truth, and every balance is always its sum (PAY-04, PAY-06,
-- PAY-12, R-07, R-10, M3-12).
--
-- Moves are written straight into the ledger here, as the functions that decide them will
-- (M3-13, M3-14): this is about what the tables allow whoever writes them.
begin;
select plan(37);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- A package paid for, as the webhook records it.
create or replace function pg_temp.paid(p_business uuid, p_learner uuid, p_pence integer)
returns uuid language sql as $$
  insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
  values (p_business, p_learner, p_pence, 'card', 'paid', now())
  returning id;
$$;

-- The lot that payment buys, and the purchase that fills it.
create or replace function pg_temp.buy(p_business uuid, p_learner uuid, p_minutes integer, p_pence integer)
returns uuid language plpgsql as $$
declare
  v_payment uuid := pg_temp.paid(p_business, p_learner, p_pence);
  v_lot uuid;
begin
  insert into public.credit_accounts (business_id, learner_id) values (p_business, p_learner)
  on conflict (business_id, learner_id) do nothing;
  insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence)
  values (p_business, p_learner, v_payment, p_minutes, p_pence)
  returning id into v_lot;
  insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
  values (p_business, p_learner, v_lot, 'purchase', p_minutes, v_payment);
  return v_lot;
end;
$$;

-- A lesson for credit to be used on, a given number of days ahead.
create or replace function pg_temp.lesson(p_business uuid, p_instructor uuid, p_learner uuid, p_type uuid, p_days integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source)
  values (p_business, p_instructor, p_learner, p_type, now() + make_interval(days => p_days),
          now() + make_interval(days => p_days, hours => 1), 30, 'confirmed', 4200, 'instructor')
  returning id;
$$;

-- How many balances and lots disagree with their ledger rows. There should never be any.
create or replace function pg_temp.drift()
returns integer language sql as $$
  select (
    (select count(*) from public.credit_accounts a
      where a.balance_minutes <> coalesce((select sum(m.minutes) from public.credit_ledger m
                                            where m.business_id = a.business_id and m.learner_id = a.learner_id), 0))
    + (select count(*) from public.credit_lots l
        where l.minutes_remaining <> coalesce((select sum(m.minutes) from public.credit_ledger m where m.lot_id = l.id), 0))
  )::int;
$$;

create or replace function pg_temp.balance(p_business uuid, p_learner uuid)
returns integer language sql as $$
  select balance_minutes from public.credit_accounts where business_id = p_business and learner_id = p_learner;
$$;

-- ---------------------------------------------------------------------------------------
-- Buying, using and giving back (PAY-04, R-07, acceptance-03).
-- ---------------------------------------------------------------------------------------
select pg_temp.buy(:'school', :'lee', 120, 8400) as lee_lot \gset
select payment_id as lee_payment from public.credit_lots where id = :'lee_lot' \gset
select pg_temp.lesson(:'school', :'ian', :'lee', :'lesson_type', 5) as lee_lesson \gset

select results_eq(
  format($$ select pg_temp.balance(%L, %L), minutes_remaining from public.credit_lots where id = %L $$,
         :'school', :'lee', :'lee_lot'),
  $$ values (120, 120) $$,
  'a package bought fills its lot and the balance'
);

insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
values (:'school', :'lee', :'lee_lot', 'use', -60, :'lee_lesson');
select is(pg_temp.balance(:'school', :'lee'), 60, 'a lesson takes its minutes off the balance');

insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
values (:'school', :'lee', :'lee_lot', 'return', 60, :'lee_lesson');
select results_eq(
  format($$ select pg_temp.balance(%L, %L),
                   (select count(*)::int from public.credit_ledger where booking_id = %L and kind = 'return') $$,
         :'school', :'lee', :'lee_lesson'),
  $$ values (120, 1) $$,
  'and cancelling in time gives every minute back in one return row (acceptance-03)'
);

-- ---------------------------------------------------------------------------------------
-- Never below nothing, never past what was bought.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
            values (%L, %L, %L, 'use', -121, %L) $$, :'school', :'lee', :'lee_lot', :'lee_lesson'),
  '23514', null,
  'a lesson cannot use more than there is'
);
select is(pg_temp.balance(:'school', :'lee'), 120, 'and the move that was refused changed nothing (R-10)');

select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
            values (%L, %L, %L, 'return', 1, %L) $$, :'school', :'lee', :'lee_lot', :'lee_lesson'),
  '23514', null,
  'nor can a lot be given back more than was bought'
);

select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
            values (%L, %L, %L, 'use', 30, %L) $$, :'school', :'lee', :'lee_lot', :'lee_lesson'),
  '23514', null,
  'using credit takes minutes away, it never adds them'
);

select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes)
            values (%L, %L, %L, 'use', -30) $$, :'school', :'lee', :'lee_lot'),
  '23514', null,
  'minutes are used, given back or kept as a fee only for a lesson (R-07)'
);

-- ---------------------------------------------------------------------------------------
-- A purchase is the whole lot, once, for one payment (R-11).
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
            values (%L, %L, %L, 'purchase', 120, %L) $$, :'school', :'lee', :'lee_lot', :'lee_payment'),
  '23505', null,
  'a lot is bought once'
);

select pg_temp.paid(:'school', :'lee', 8400) as spare_payment \gset
select throws_ok(
  format($$ with lot as (
              insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence)
              values (%L, %L, %L, 120, 8400)
              returning id
            )
            insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
            select %L, %L, id, 'purchase', 100, %L from lot $$,
         :'school', :'lee', :'spare_payment', :'school', :'lee', :'spare_payment'),
  'P0001', 'VALIDATION_FAILED',
  'a purchase fills its whole lot, no more and no less'
);

select throws_ok(
  format($$ insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence)
            values (%L, %L, %L, 60, 4200) $$, :'school', :'lee', :'lee_payment'),
  '23505', null,
  'one payment buys one lot, however many times its webhook arrives (R-11)'
);

-- ---------------------------------------------------------------------------------------
-- Credit belongs to one learner at one Business (PAY-12).
-- ---------------------------------------------------------------------------------------
select pg_temp.buy(:'asha_biz', :'lee', 60, 4000) as lee_asha_lot \gset

select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
            values (%L, %L, %L, 'use', -60, %L) $$, :'school', :'lee', :'lee_asha_lot', :'lee_lesson'),
  '23503', null,
  'credit bought from one Business cannot be spent with another (PAY-12)'
);

select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id)
            values (%L, %L, %L, 'use', -60, %L) $$, :'school', :'lou', :'lee_lot', :'lee_lesson'),
  '23503', null,
  'or by another learner'
);

select throws_ok(
  format($$ insert into public.credit_accounts (business_id, learner_id) values (%L, %L) $$, :'school', :'liz'),
  '23503', null,
  'and only a learner of a Business holds credit with it'
);

-- ---------------------------------------------------------------------------------------
-- Only the ledger moves a balance or a lot.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ update public.credit_accounts set balance_minutes = 600 where business_id = %L and learner_id = %L $$,
         :'school', :'lee'),
  '42501', 'credit balances change only through credit_ledger',
  'a balance cannot be written, even by the table owner'
);

select throws_ok(
  format($$ update public.credit_lots set minutes_remaining = 0 where id = %L $$, :'lee_lot'),
  '42501', 'credit lots change only through credit_ledger',
  'nor can what is left in a lot'
);

select throws_ok(
  format($$ update public.credit_lots set price_pence = 1 where id = %L $$, :'lee_lot'),
  '42501', 'what a credit lot was bought as cannot change',
  'a lot keeps the price it was bought for, which is what a refund of it is worth (PAY-07)'
);

select throws_ok(
  format($$ insert into public.credit_lots (business_id, learner_id, minutes_total, minutes_remaining, price_pence)
            values (%L, %L, 60, 60, 0) $$, :'school', :'lee'),
  '42501', 'a credit lot starts empty and is filled by credit_ledger',
  'a lot starts empty, so only its ledger fills it'
);

select throws_ok(
  format($$ insert into public.credit_accounts (business_id, learner_id, balance_minutes) values (%L, %L, 60) $$,
         :'school', :'lou'),
  '42501', 'a credit account starts empty and is filled by credit_ledger',
  'and so does an account'
);

select throws_ok(
  $$ update public.credit_ledger set minutes = minutes * 2 $$,
  '42501', 'credit_ledger is append-only',
  'a ledger row cannot be changed'
);
select throws_ok(
  $$ delete from public.credit_ledger $$,
  '42501', 'credit_ledger is append-only',
  'or deleted'
);
select throws_ok(
  $$ truncate public.credit_ledger $$,
  '42501', 'credit_ledger is append-only',
  'or truncated'
);

-- ---------------------------------------------------------------------------------------
-- Moves made by a person, or paid back, say so (PAY-07).
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes)
            values (%L, %L, %L, 'adjustment', -30) $$, :'school', :'lee', :'lee_lot'),
  '23514', null,
  'credit taken away by hand has to say who and why'
);
select lives_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, actor_id, reason)
            values (%L, %L, %L, 'adjustment', -30, %L, 'Half an hour paid for in cash instead') $$,
         :'school', :'lee', :'lee_lot', :'ben'),
  'and then it can be'
);
select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes)
            values (%L, %L, %L, 'refund', -30) $$, :'school', :'lee', :'lee_lot'),
  '23514', null,
  'minutes paid back as money point at the refund that paid them'
);

-- ---------------------------------------------------------------------------------------
-- Whatever happens, in whatever order, a balance is the sum of its ledger (M3-12).
-- ---------------------------------------------------------------------------------------
create temp table wallets as
select * from (values
  ('bbbb0000-0000-0000-0000-000000000000'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid,
   'b1000000-0000-0000-0000-000000000001'::uuid, 'b2000000-0000-0000-0000-000000000001'::uuid, 10),
  ('bbbb0000-0000-0000-0000-000000000000'::uuid, 'c0000000-0000-0000-0000-000000000002'::uuid,
   'b1000000-0000-0000-0000-000000000002'::uuid, 'b2000000-0000-0000-0000-000000000001'::uuid, 20),
  ('aaaa0000-0000-0000-0000-000000000000'::uuid, 'c0000000-0000-0000-0000-000000000001'::uuid,
   'a1000000-0000-0000-0000-000000000001'::uuid, 'a2000000-0000-0000-0000-000000000001'::uuid, 30)
) as w (business_id, learner_id, instructor_id, lesson_type_id, first_day);

create temp table outcome (applied integer, refused integer);

do $$
declare
  v_wallet record;
  v_lot uuid;
  v_kind text;
  v_minutes integer;
  v_lessons uuid[];
  v_refunds uuid[];
  v_applied integer := 0;
  v_refused integer := 0;
begin
  perform setseed(0.42);

  for v_wallet in select * from wallets loop
    perform pg_temp.buy(v_wallet.business_id, v_wallet.learner_id, 600, 38000);
    perform pg_temp.buy(v_wallet.business_id, v_wallet.learner_id, 120, 8400);
    perform pg_temp.buy(v_wallet.business_id, v_wallet.learner_id, 7, 10000);
    perform pg_temp.lesson(v_wallet.business_id, v_wallet.instructor_id, v_wallet.learner_id, v_wallet.lesson_type_id, v_wallet.first_day);
    perform pg_temp.lesson(v_wallet.business_id, v_wallet.instructor_id, v_wallet.learner_id, v_wallet.lesson_type_id, v_wallet.first_day + 1);
    insert into public.refunds (business_id, learner_id, amount_pence, reason)
    values (v_wallet.business_id, v_wallet.learner_id, 1900, 'Unused credit');
  end loop;

  for i in 1..400 loop
    select * into v_wallet from wallets order by random() limit 1;
    select id into v_lot from public.credit_lots
     where business_id = v_wallet.business_id and learner_id = v_wallet.learner_id
     order by random() limit 1;
    select array_agg(id) into v_lessons from public.bookings
     where business_id = v_wallet.business_id and learner_id = v_wallet.learner_id;
    select array_agg(id) into v_refunds from public.refunds
     where business_id = v_wallet.business_id and learner_id = v_wallet.learner_id;

    v_kind := (array['use', 'return', 'fee', 'expiry', 'adjustment', 'refund'])[1 + floor(random() * 6)::int];
    v_minutes := 1 + floor(random() * 90)::int;

    begin
      insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, refund_id, actor_id, reason)
      values (
        v_wallet.business_id, v_wallet.learner_id, v_lot, v_kind::public.credit_entry_kind,
        case
          when v_kind = 'return' then v_minutes
          when v_kind = 'adjustment' and random() < 0.5 then v_minutes
          else -v_minutes
        end,
        case when v_kind in ('use', 'return', 'fee') then v_lessons[1 + floor(random() * array_length(v_lessons, 1))::int] end,
        case when v_kind = 'refund' then v_refunds[1] end,
        case when v_kind = 'adjustment' then 'b0000000-0000-0000-0000-000000000001'::uuid end,
        case when v_kind = 'adjustment' then 'Put right by hand' end
      );
      v_applied := v_applied + 1;
    exception when check_violation then
      v_refused := v_refused + 1;
    end;
  end loop;

  insert into outcome values (v_applied, v_refused);
end;
$$;

select is(pg_temp.drift(), 0, 'after four hundred moves in any order, every balance and every lot is the sum of its ledger');
select ok(
  (select applied > 0 and refused > 0 from outcome),
  'with moves applied and moves refused for going below nothing or past what was bought along the way'
);

-- ---------------------------------------------------------------------------------------
-- Who sees credit: the people who see the learner card (PAY-06, LRN-02).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select results_eq(
  $$ select business_id::text from public.credit_accounts order by business_id $$,
  $$ values ('aaaa0000-0000-0000-0000-000000000000'), ('bbbb0000-0000-0000-0000-000000000000') $$,
  'a learner sees their credit with every Business they hold it with (PAY-06)'
);
select is_empty(
  $$ select 1 from public.credit_ledger where learner_id <> 'c0000000-0000-0000-0000-000000000001' $$,
  'and no other learner credit'
);

select tests.authenticate_as(:'ben');
select results_eq(
  $$ select learner_id::text from public.credit_accounts order by learner_id $$,
  $$ values ('c0000000-0000-0000-0000-000000000001'), ('c0000000-0000-0000-0000-000000000002') $$,
  'the owner of a school sees the credit its learners hold with it'
);
select is_empty(
  $$ select 1 from public.credit_lots where business_id <> 'bbbb0000-0000-0000-0000-000000000000' $$,
  'and none they hold with anybody else'
);

select tests.authenticate_as(:'ian_user');
select results_eq(
  $$ select distinct business_id::text, learner_id::text from public.credit_ledger $$,
  $$ values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001') $$,
  'an instructor in a school sees the credit of the learner they teach, and nobody else (LRN-02)'
);

select tests.authenticate_as(:'ivy_user');
select results_eq(
  $$ select distinct business_id::text, learner_id::text from public.credit_lots $$,
  $$ values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000002') $$,
  'which for the other instructor is the other learner'
);

select tests.authenticate_as(:'asha_user');
select results_eq(
  $$ select distinct business_id::text, learner_id::text from public.credit_accounts $$,
  $$ values ('aaaa0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001') $$,
  'an independent instructor sees the credit held with their own Business only'
);

select tests.authenticate_as(:'otto');
select is_empty(
  $$ select 1 from public.credit_accounts
     union all select 1 from public.credit_lots
     union all select 1 from public.credit_ledger $$,
  'somebody with no part in it sees no credit at all'
);

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, actor_id, reason)
            values (%L, %L, %L, 'adjustment', 600, %L, 'Free hours') $$, :'school', :'lee', :'lee_lot', :'ben'),
  '42501', null,
  'nobody writes to the ledger directly, not even the owner: moves go through the functions that decide them'
);
select throws_ok(
  format($$ update public.credit_accounts set balance_minutes = 6000 where business_id = %L $$, :'school'),
  '42501', null,
  'or to a balance'
);

select * from finish();
rollback;
