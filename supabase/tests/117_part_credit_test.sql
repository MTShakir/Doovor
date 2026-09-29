-- Credit pays for what it covers and the rest is paid the usual way (PAY-04, PAY-09, D-225).
--
-- The money is what matters here: what the learner is charged for the rest, and that cancelling
-- gives each part back the way it came, the minutes as minutes and the money as money.
begin;
select plan(12);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

-- The school takes payment in person, asks for no notice, and works every hour of every day.
update public.businesses
   set settings = coalesce(settings, '{}'::jsonb) || '{"notice_hours": 0, "payment_mode": "offline"}'
 where id = :'school';
insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
select :'ivy', :'school', weekday, '06:00', '22:00' from generate_series(1, 7) as weekday;
-- An hour is £42 and two hours are £82, so the split is not simply half and the rounding shows.
insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
values (:'school', :'lesson_type', 60, 4200), (:'school', :'lesson_type', 120, 8200);

create or replace function pg_temp.at(p_days integer, p_time text)
returns timestamptz language sql stable as $$
  select ((private.today() + p_days)::text || ' ' || p_time)::timestamp at time zone 'Europe/London';
$$;

create or replace function pg_temp.held(p_booking uuid)
returns integer language sql as $$
  select coalesce(-sum(minutes), 0)::int from public.credit_ledger
   where booking_id = p_booking and kind in ('use', 'return');
$$;

-- One hour of credit, against a two hour lesson.
insert into public.payments (id, business_id, learner_id, amount_pence, method, status, paid_at)
values ('dddd0000-0000-0000-0000-000000000001', :'school', :'lou', 4000, 'card', 'paid', now() - interval '2 days');
insert into public.credit_accounts (business_id, learner_id) values (:'school', :'lou')
on conflict (business_id, learner_id) do nothing;
insert into public.credit_lots (id, business_id, learner_id, payment_id, minutes_total, price_pence, purchased_at)
values ('cccc0000-0000-0000-0000-000000000001', :'school', :'lou', 'dddd0000-0000-0000-0000-000000000001', 60, 4000, now() - interval '2 days');
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id)
values (:'school', :'lou', 'cccc0000-0000-0000-0000-000000000001', 'purchase', 60, 'dddd0000-0000-0000-0000-000000000001');

insert into public.learner_relationships (business_id, learner_id, instructor_id)
values (:'school', :'lou', :'ivy') on conflict do nothing;

-- ---------------------------------------------------------------------------------------
-- Booking: the hour is spent and the hour is owed.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ivy_user');
select public.create_booking(:'ivy', :'lou', :'lesson_type', pg_temp.at(3, '10:00'), 120) as lesson \gset
select tests.clear_authentication();

select is((select credit_minutes from public.bookings where id = :'lesson'), 60, 'the hour of credit is spent on the two hour lesson');
select is(pg_temp.held(:'lesson'), 60, 'and the ledger says so');
select is(
  (select balance_minutes from public.credit_accounts where business_id = :'school' and learner_id = :'lou'),
  0,
  'and the balance is empty'
);
select is(
  (select payment_status::text from public.bookings where id = :'lesson'),
  'unpaid',
  'the lesson is not paid for until the rest of it is'
);
select is(
  (select private.booking_owed_pence(b) from public.bookings b where id = :'lesson'),
  4100,
  'and what is owed is the price less what the hour was worth, half of 8200'
);

-- ---------------------------------------------------------------------------------------
-- The rest, in cash. The instructor is handed the remainder, not the price.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ivy_user');
select public.record_offline_payment(:'lesson', 'cash') as paid \gset
select tests.clear_authentication();

select is((select amount_pence from public.payments where id = :'paid'), 4100, 'the cash taken is the rest, not the whole price');
select is(
  (select payment_status::text from public.bookings where id = :'lesson'),
  'paid_cash',
  'and the lesson is paid'
);
select is(
  (select credit_minutes from public.bookings where id = :'lesson'),
  60,
  'and it still remembers the hour that came from credit, which is what the label reads'
);

-- ---------------------------------------------------------------------------------------
-- Called off in good time: each part goes back the way it came (R-06, R-07).
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ivy_user');
select public.cancel_booking(:'lesson', 'Something came up');
select tests.clear_authentication();

select is(
  (select balance_minutes from public.credit_accounts where business_id = :'school' and learner_id = :'lou'),
  60,
  'the hour of credit is back on the balance'
);
select is(pg_temp.held(:'lesson'), 0, 'and the lesson holds none of it');
select is(
  (select coalesce(sum(amount_pence), 0)::int from public.refunds where booking_id = :'lesson'),
  4100,
  'and the cash is owed back, all of it, because nothing was kept'
);
-- The two together come to what the learner actually parted with for this lesson: an hour of
-- credit and 4100 in cash. Neither half was forgotten because the other one existed.
select is(
  (select credit_minutes from public.bookings where id = :'lesson'),
  60,
  'and what the lesson was paid with is still on the record'
);

select * from finish();
rollback;
