-- Booking rules stay inside the ranges the product sets (PRD 11.1, M1-18).
begin;
select plan(10);

select tests.create_fixture();

\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set bee_biz 'bbbb0000-0000-0000-0000-000000000000'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'

\set good '{"notice_hours": 48, "horizon_weeks": 12, "cancellation_window_hours": 24, "late_fee_percent": 50, "request_expiry_hours": 6}'

select tests.authenticate_as(:'asha_user');
select ok(public.set_booking_rules(:'asha_biz', :'good'::jsonb) is not null, 'an owner sets the rules for their Business');
select is(
  (select (settings ->> 'notice_hours')::int from public.businesses where id = :'asha_biz'),
  48,
  'and they are kept'
);
select is(
  (select (settings ->> 'late_fee_percent')::int from public.businesses where id = :'asha_biz'),
  50,
  'including the late cancellation fee'
);

-- Ranges from PRD 11.1
select throws_ok(
  format($$ select public.set_booking_rules(%L, '{"notice_hours": 73, "horizon_weeks": 8, "cancellation_window_hours": 48, "late_fee_percent": 100, "request_expiry_hours": 12}'::jsonb) $$, :'asha_biz'),
  'P0001', 'VALIDATION_FAILED', 'more than 72 hours notice is refused'
);
select throws_ok(
  format($$ select public.set_booking_rules(%L, '{"notice_hours": 24, "horizon_weeks": 27, "cancellation_window_hours": 48, "late_fee_percent": 100, "request_expiry_hours": 12}'::jsonb) $$, :'asha_biz'),
  'P0001', 'VALIDATION_FAILED', 'and a horizon beyond 26 weeks'
);
select throws_ok(
  format($$ select public.set_booking_rules(%L, '{"notice_hours": 24, "horizon_weeks": 8, "cancellation_window_hours": 48, "late_fee_percent": 75, "request_expiry_hours": 12}'::jsonb) $$, :'asha_biz'),
  'P0001', 'VALIDATION_FAILED', 'and a late fee that is not 0, 50 or 100'
);
select throws_ok(
  format($$ select public.set_booking_rules(%L, '{"notice_hours": 24, "horizon_weeks": 8, "cancellation_window_hours": 48, "late_fee_percent": 100, "request_expiry_hours": 0}'::jsonb) $$, :'asha_biz'),
  'P0001', 'VALIDATION_FAILED', 'and a request that expires immediately'
);

-- Who may change them
select throws_ok(
  format($$ select public.set_booking_rules(%L, %L::jsonb) $$, :'bee_biz', :'good'),
  '42501', 'NOT_ALLOWED', 'nobody sets the rules for a Business they are not in'
);
select tests.authenticate_as(:'ivy_user');
select throws_ok(
  format($$ select public.set_booking_rules(%L, %L::jsonb) $$, :'bee_biz', :'good'),
  '42501', 'NOT_ALLOWED', 'and an instructor at a school does not set the school rules'
);

-- The buffer is the instructor's own (PRD 11.1), and its range is on the column.
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ update public.instructor_profiles set buffer_minutes = 61 where id = %L $$, :'asha'),
  '23514', null, 'a buffer longer than an hour is refused by the column itself'
);

select * from finish();
rollback;
