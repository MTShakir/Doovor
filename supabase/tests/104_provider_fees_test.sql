-- What taking a card payment cost the instructor (MNY-02, D-198).
begin;
select plan(7);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, payment_status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type', now() - interval '1 day', now() - interval '1 day' + interval '1 hour',
        0, 'completed', 'paid_card', 4200, 'instructor')
returning id as lesson \gset

insert into public.payments (business_id, learner_id, booking_id, provider, provider_ref, amount_pence, method, status, paid_at)
values (:'school', :'lee', :'lesson', 'stripe', 'pi_fee_test', 4200, 'card', 'paid', now())
returning id as payment \gset

select is(
  (select provider_fee_pence from public.payments where id = :'payment'),
  null,
  'what the provider kept is unknown until it says, which is not the same as nothing'
);

select is(
  (public.system_set_provider_fee('pi_fee_test', 83) ->> 'applied')::boolean,
  true,
  'the fee is written down when the provider answers'
);
select is((select provider_fee_pence from public.payments where id = :'payment'), 83, 'and it is kept in pence');

select is(
  (public.system_set_provider_fee('pi_fee_test', 99) ->> 'reason'),
  'already_known',
  'an event that arrives twice does not rewrite the books (R-11)'
);
select is((select provider_fee_pence from public.payments where id = :'payment'), 83, 'so the first answer stands');

select is(
  (public.system_set_provider_fee('pi_nothing_here', 83) ->> 'reason'),
  'no_payment',
  'a fee for a payment we never took is nobody'
);

-- A payment whose fee is still unknown, so the check below is the one being tested rather than
-- the answer already being in.
insert into public.payments (business_id, learner_id, booking_id, provider, provider_ref, amount_pence, method, status, paid_at)
values (:'school', :'lee', :'lesson', 'stripe', 'pi_fee_too_big', 4200, 'card', 'paid', now());

select throws_ok(
  $$ select public.system_set_provider_fee('pi_fee_too_big', 500000) $$,
  'P0001', 'VALIDATION_FAILED',
  'and a fee larger than the payment it came out of is refused'
);

select * from finish();
rollback;
