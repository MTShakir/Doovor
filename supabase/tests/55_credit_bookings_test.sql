-- Lessons paid with credit, and credit given back (PAY-04, PAY-12, R-07, R-08, R-10, R-12,
-- M3-14, acceptance-03).
--
-- Each booking, cancellation or answer is made in a statement of its own, and what it did is
-- read in the next one.
begin;
select plan(19);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- The school takes cards at booking, asks for no notice, and its instructors work every day.
select tests.authenticate_as(:'ben');
select public.set_payments_account(:'school', 'acct_credit');
select tests.clear_authentication();
select public.system_set_payments_state('acct_credit', true, true, true);

update public.businesses set settings = coalesce(settings, '{}'::jsonb) || '{"notice_hours": 0}' where id = :'school';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select profile, :'school', weekday, '06:00', '22:00'
  from unnest(array[:'ian', :'ivy']::uuid[]) as profile, generate_series(1, 7) as weekday;
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200), (:'school', :'lesson_type', 90, 6200);

-- A package bought on a given day, and the purchase that filled it.
create or replace function pg_temp.buy(
  p_business uuid, p_learner uuid, p_minutes integer, p_pence integer, p_bought timestamptz,
  p_expires timestamptz default null
)
returns uuid language plpgsql as $$
declare
  v_payment uuid;
  v_lot uuid;
begin
  insert into public.payments (business_id, learner_id, amount_pence, method, status, paid_at)
  values (p_business, p_learner, p_pence, 'card', 'paid', p_bought)
  returning id into v_payment;
  insert into public.credit_accounts (business_id, learner_id) values (p_business, p_learner)
  on conflict (business_id, learner_id) do nothing;
  insert into public.credit_lots (business_id, learner_id, payment_id, minutes_total, price_pence, purchased_at, expires_at)
  values (p_business, p_learner, v_payment, p_minutes, p_pence, p_bought, p_expires)
  returning id into v_lot;
  insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
  values (p_business, p_learner, v_lot, 'purchase', p_minutes, v_payment);
  return v_lot;
end;
$$;

create or replace function pg_temp.balance(p_business uuid, p_learner uuid)
returns integer language sql as $$
  select coalesce((select balance_minutes from public.credit_accounts
                    where business_id = p_business and learner_id = p_learner), 0);
$$;

-- Minutes a lesson still holds: used and not given back.
create or replace function pg_temp.held(p_booking uuid)
returns integer language sql as $$
  select coalesce(-sum(minutes), 0)::int from public.credit_ledger
   where booking_id = p_booking and kind in ('use', 'return');
$$;

-- A local time some days from whenever this runs (D-070).
create or replace function pg_temp.local_at(p_days integer, p_time text)
returns timestamptz language sql stable as $$
  select (((now() at time zone 'Europe/London')::date + p_days) + p_time::time) at time zone 'Europe/London';
$$;

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

-- Lee has two hours with the school: an older one and a newer one.
select pg_temp.buy(:'school', :'lee', 60, 4000, now() - interval '20 days') as lee_old \gset
select pg_temp.buy(:'school', :'lee', 60, 4200, now() - interval '2 days') as lee_new \gset

-- ---------------------------------------------------------------------------------------
-- acceptance-03: 120 minutes, book 60, 60 left, cancel 72 hours before, 120 again.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select public.create_booking(:'ian', :'lee', :'lesson_type', pg_temp.local_at(5, '10:00'), 60) as in_time \gset
select tests.clear_authentication();

select results_eq(
  format($$ select status::text, payment_status::text, payment_mode::text, credit_minutes, hold_expires_at is null
              from public.bookings where id = %L $$, :'in_time'),
  $$ values ('confirmed', 'paid_credit', 'credit', 60, true) $$,
  'a learner with credit books, and the lesson is paid from it and confirmed, with nothing held for a card (PAY-04)'
);

select results_eq(
  format($$ select pg_temp.balance(%L, %L),
                   (select minutes_remaining from public.credit_lots where id = %L),
                   (select minutes_remaining from public.credit_lots where id = %L) $$,
         :'school', :'lee', :'lee_old', :'lee_new'),
  $$ values (60, 0, 60) $$,
  'acceptance-03: the credit shows 60 minutes, taken from the oldest lot first'
);

select tests.authenticate_as(:'lee');
select public.cancel_booking(:'in_time') as in_time_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select %L::jsonb ->> 'credit_returned_minutes', pg_temp.balance(%L, %L),
                   (select count(*)::int from public.credit_ledger where booking_id = %L and kind = 'return'),
                   (select count(*)::int from public.credit_ledger where booking_id = %L and kind = 'fee'),
                   (select payment_status::text from public.bookings where id = %L) $$,
         :'in_time_cancel', :'school', :'lee', :'in_time', :'in_time', :'in_time'),
  $$ values ('60', 120, 1, 0, 'refunded') $$,
  'acceptance-03: cancelled days before, the credit returns to 120 minutes in one return row (R-07)'
);

-- ---------------------------------------------------------------------------------------
-- Late, by the learner: the credit pays the fee (R-07).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select public.create_booking(:'ian', :'lee', :'lesson_type', pg_temp.local_at(1, '10:00'), 90) as late_lesson \gset
select tests.clear_authentication();

select is(pg_temp.balance(:'school', :'lee'), 30, 'ninety minutes take the older hour and half the newer one');

select tests.authenticate_as(:'lee');
select public.cancel_booking(:'late_lesson') as late_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select %L::jsonb ->> 'credit_returned_minutes', %L::jsonb ->> 'credit_kept_minutes', pg_temp.balance(%L, %L),
                   (select payment_status::text from public.bookings where id = %L) $$,
         :'late_cancel', :'late_cancel', :'school', :'lee', :'late_lesson'),
  $$ values ('0', '90', 30, 'paid_credit') $$,
  'cancelled late, the fee is kept from the credit: all ninety minutes, at the usual hundred per cent'
);

select results_eq(
  format($$ select m.minutes from public.credit_ledger m join public.credit_lots l on l.id = m.lot_id
             where m.booking_id = %L and m.kind = 'fee' order by l.purchased_at $$, :'late_lesson'),
  $$ values (-60), (-30) $$,
  'kept from the lots the lesson used, in the order it used them'
);

update public.businesses set settings = settings || '{"late_fee_percent": 50}' where id = :'school';
select pg_temp.buy(:'school', :'lee', 600, 38000, now() - interval '1 day') as lee_block \gset

select tests.authenticate_as(:'lee');
select public.create_booking(:'ian', :'lee', :'lesson_type', pg_temp.local_at(1, '14:00'), 90) as half_lesson \gset
select public.cancel_booking(:'half_lesson') as half_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select %L::jsonb ->> 'credit_returned_minutes', %L::jsonb ->> 'credit_kept_minutes',
                   (select payment_status::text from public.bookings where id = %L) $$,
         :'half_cancel', :'half_cancel', :'half_lesson'),
  $$ values ('45', '45', 'partially_refunded') $$,
  'at a fifty per cent fee, half the lesson''s credit comes back'
);

-- ---------------------------------------------------------------------------------------
-- The instructor calling it off never costs the learner (R-08).
-- ---------------------------------------------------------------------------------------
select pg_temp.balance(:'school', :'lee') as before_ian \gset
select tests.authenticate_as(:'ian_user');
select public.create_booking(:'ian', :'lee', :'lesson_type', pg_temp.local_at(1, '18:00'), 60) as by_ian \gset
select tests.clear_authentication();

select results_eq(
  format($$ select payment_status::text, %s - pg_temp.balance(%L, %L) from public.bookings where id = %L $$,
         :'before_ian', :'school', :'lee', :'by_ian'),
  $$ values ('paid_credit', 60) $$,
  'an instructor booking for a learner with credit is paid from it as well'
);

select tests.authenticate_as(:'ian_user');
select public.cancel_booking(:'by_ian', 'The car is in for repair') as ian_cancel \gset
select tests.clear_authentication();

select results_eq(
  format($$ select %L::jsonb ->> 'credit_returned_minutes', %L::jsonb ->> 'credit_kept_minutes', pg_temp.balance(%L, %L) $$,
         :'ian_cancel', :'ian_cancel', :'school', :'lee'),
  format($$ values ('60', '0', %s) $$, :'before_ian'),
  'and calling it off, however late, gives every minute back'
);

-- ---------------------------------------------------------------------------------------
-- Not enough credit is no credit (PAY-04, PAY-12).
-- ---------------------------------------------------------------------------------------
insert into public.learner_relationships (business_id, learner_id, instructor_id)
values (:'asha_biz', :'lou', 'a1000000-0000-0000-0000-000000000001');
select pg_temp.buy(:'asha_biz', :'lou', 600, 40000, now() - interval '5 days') as lou_elsewhere \gset
select pg_temp.buy(:'school', :'lou', 30, 2000, now() - interval '3 days') as lou_half_hour \gset
select pg_temp.buy(:'school', :'lou', 120, 8000, now() - interval '400 days', now() - interval '35 days') as lou_run_out \gset

select tests.authenticate_as(:'lou');
select public.create_booking(:'ivy', :'lou', :'lesson_type', pg_temp.local_at(6, '10:00'), 60) as no_credit \gset
select tests.clear_authentication();

select results_eq(
  format($$ select status::text, payment_status::text,
                   (select count(*)::int from public.credit_ledger where booking_id = %L)
              from public.bookings where id = %L $$, :'no_credit', :'no_credit'),
  $$ values ('pending_payment', 'unpaid', 0) $$,
  'half an hour left, an hour that has run out and credit with another Business pay for nothing: the lesson waits for a card'
);

-- ---------------------------------------------------------------------------------------
-- A request is paid from credit when it is made, and a request that ends gives it back (R-12).
-- ---------------------------------------------------------------------------------------
update public.instructor_profiles set instant_book = false where id = :'ivy';
select pg_temp.buy(:'school', :'lou', 120, 8000, now() - interval '1 day') as lou_hours \gset

select tests.authenticate_as(:'lou');
select public.create_booking(:'ivy', :'lou', :'lesson_type', pg_temp.local_at(7, '10:00'), 60) as asked \gset
select tests.clear_authentication();

select results_eq(
  format($$ select status::text, payment_status::text, pg_temp.held(%L) from public.bookings where id = %L $$,
         :'asked', :'asked'),
  $$ values ('requested', 'paid_credit', 60) $$,
  'a request with credit is paid from it at once, so there is no card to authorise'
);

select tests.authenticate_as(:'ivy_user');
select public.decide_booking_request(:'asked', false, 'Away that week');
select tests.clear_authentication();

select results_eq(
  format($$ select status::text, payment_status::text, pg_temp.held(%L) from public.bookings where id = %L $$,
         :'asked', :'asked'),
  $$ values ('cancelled', 'refunded', 0) $$,
  'declined, every minute goes back'
);

select tests.authenticate_as(:'lou');
select public.create_booking(:'ivy', :'lou', :'lesson_type', pg_temp.local_at(8, '10:00'), 60) as lapsing \gset
select tests.clear_authentication();
update public.bookings set expires_at = now() - interval '1 minute' where id = :'lapsing';
select public.system_expire_requests();

select results_eq(
  format($$ select status::text, payment_status::text, pg_temp.held(%L) from public.bookings where id = %L $$,
         :'lapsing', :'lapsing'),
  $$ values ('expired', 'refunded', 0) $$,
  'and a request nobody answered gives it back when it lapses'
);

-- ---------------------------------------------------------------------------------------
-- A lesson made longer pays for its new length.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select public.create_booking(:'ian', :'lee', :'lesson_type', pg_temp.local_at(10, '10:00'), 60) as moving \gset
select public.reschedule_booking(:'moving', pg_temp.local_at(10, '12:00'), 90);
select tests.clear_authentication();

select results_eq(
  format($$ select payment_status::text, credit_minutes, pg_temp.held(%L) from public.bookings where id = %L $$,
         :'moving', :'moving'),
  $$ values ('paid_credit', 90, 90) $$,
  'moved and made longer, a credit lesson gives its hour back and pays for ninety minutes'
);

select tests.authenticate_as(:'ivy_user');
select public.create_booking(:'ivy', :'lou', :'lesson_type', pg_temp.local_at(11, '09:00'), 60) as stretched \gset
select public.reschedule_booking(:'stretched', pg_temp.local_at(11, '09:00'), 240);
select tests.clear_authentication();

select results_eq(
  format($$ select payment_status::text, payment_mode::text, pg_temp.held(%L) from public.bookings where id = %L $$,
         :'stretched', :'stretched'),
  $$ values ('unpaid', 'offline', 0) $$,
  'made longer than the credit left, it is not part paid: the credit goes back and the lesson is paid the usual way'
);

-- ---------------------------------------------------------------------------------------
-- Every week of a weekly slot, and what holds it all together.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
create temp table weekly as
select * from public.book_weekly(:'ian', :'lee', :'lesson_type', pg_temp.local_at(14, '10:00'), 60, 2);
select tests.clear_authentication();

select is(
  (select count(*)::int from weekly w join public.bookings b on b.id = w.booking_id where b.payment_status = 'paid_credit'),
  2,
  'each week of a weekly slot is paid from credit too'
);

select is(pg_temp.drift(), 0, 'and after all of it every balance and every lot is still the sum of its ledger');

select tests.authenticate_as(:'lee');
select throws_ok(
  format($$ select private.pay_with_credit(%L, %L) $$, :'no_credit', :'lee'),
  '42501', null,
  'nobody pays with credit except through booking'
);
select throws_ok(
  format($$ select private.give_back_credit(%L, 0, %L) $$, :'late_lesson', :'lee'),
  '42501', null,
  'or gives credit back except by calling a lesson off'
);

select * from finish();
rollback;
