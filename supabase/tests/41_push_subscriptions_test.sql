-- Web push subscriptions (NTF-01, M2-29).
begin;
select plan(6);

select tests.create_fixture();

\set lee 'c0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'

-- ---------------------------------------------------------------------------------------
-- A browser signs itself up.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');

select lives_ok(
  $$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ((select auth.uid()), 'https://push.example.com/subscription/lee-phone',
             'BN0Testkeythatislongenough0000', 'authTestKey12345', 'Chrome on Android') $$,
  'somebody signs this browser up for push'
);

select is(
  (select count(*)::int from public.push_subscriptions),
  1,
  'and sees their own'
);

select throws_ok(
  format($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
            values (%L, 'https://push.example.com/subscription/not-mine',
                    'BN0Testkeythatislongenough0000', 'authTestKey12345') $$, :'ian_user'),
  '42501', null, 'and cannot sign anybody else up'
);

-- ---------------------------------------------------------------------------------------
-- Nobody else's business.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();
select tests.authenticate_as(:'ian_user');

select is(
  (select count(*)::int from public.push_subscriptions),
  0,
  'nobody else can see where a person is pushed'
);

-- ---------------------------------------------------------------------------------------
-- What the job sees.
-- ---------------------------------------------------------------------------------------
select tests.clear_authentication();

select is(
  (select endpoint from public.system_push_targets(:'lee')),
  'https://push.example.com/subscription/lee-phone',
  'a job is told where to send'
);

select id as gone from public.push_subscriptions limit 1 \gset
select is(
  (select public.system_drop_push_target(:'gone')),
  1,
  'and forgets a browser the push service says has gone'
);

select * from finish();
rollback;
