-- The limiter counts hits per key per window, and nobody reaches it through the API
-- (NFR-SEC-03, D-008, M2-02).
begin;
select plan(11);

select tests.create_user('limited@test.local', 'Lily Limit') as user \gset

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'rate_limit_buckets'),
  'the buckets have row-level security'
);

select tests.authenticate_as(:'user');
select throws_ok(
  $$ select key from public.rate_limit_buckets $$,
  '42501',
  null,
  'and nobody can read them: a limiter is not a screen'
);
select throws_ok(
  $$ select private.rate_limit_hit('invite:someone', interval '1 minute', 5) $$,
  '42501',
  null,
  'nor call the limiter directly'
);

select tests.clear_authentication();

-- Three of three allowed, the fourth refused.
select is(private.rate_limit_hit('invite:a', interval '1 hour', 3), true, 'the first hit is allowed');
select is(private.rate_limit_hit('invite:a', interval '1 hour', 3), true, 'and the second');
select is(private.rate_limit_hit('invite:a', interval '1 hour', 3), true, 'and the third');
select is(private.rate_limit_hit('invite:a', interval '1 hour', 3), false, 'the fourth is refused');

-- A different key has its own count.
select is(private.rate_limit_hit('invite:b', interval '1 hour', 3), true, 'another key is counted on its own');

-- The function the app calls builds the key itself.
select is(
  public.system_rate_limit_hit('invite', 'a', 3600, 3),
  false,
  'the app function counts against the same key as the one built by hand'
);
select tests.authenticate_as(:'user');
select throws_ok(
  $$ select public.system_rate_limit_hit('invite', 'someone', 3600, 5) $$,
  '42501',
  null,
  'and a signed-in person cannot call it either: it runs in jobs and server code'
);
select tests.clear_authentication();

-- What is refused outright.
select throws_ok(
  $$ select private.rate_limit_hit('', interval '1 hour', 3) $$,
  'P0001',
  'VALIDATION_FAILED',
  'a limiter with no key would limit everyone at once'
);

select * from finish();
rollback;
