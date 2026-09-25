-- Telling another instructor about it (D-205).
begin;
select plan(13);

select tests.create_user('rita.ref@test.local', 'Rita Referrer') as rita \gset
select tests.create_user('sam.ref@test.local', 'Sam Sent') as sam \gset
select tests.create_user('tom.ref@test.local', 'Tom Typo') as tom \gset
select tests.create_user('una.ref@test.local', 'Una Unknown') as una \gset

-- ---------------------------------------------------------------------------------------
-- Every Business has a code, whatever made it.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'rita');
select public.create_business('independent', 'Rita Driving') as rita_business \gset
select tests.clear_authentication();

select matches(
  (select referral_code from public.businesses where id = :'rita_business'),
  '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$',
  'a new Business gets a code of eight readable characters'
);
select is(
  (select count(*)::int from public.businesses where referral_code is null),
  0,
  'and so does every Business made before this, by the backfill'
);
select is(
  (select count(distinct referral_code)::int from public.businesses),
  (select count(*)::int from public.businesses),
  'and no two Businesses share one'
);

select referral_code as rita_code from public.businesses where id = :'rita_business' \gset

-- ---------------------------------------------------------------------------------------
-- Somebody arrives on the link.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'sam');
select public.create_business('independent', 'Sam Driving', :'rita_code') as sam_business \gset
select tests.clear_authentication();

select results_eq(
  format($$ select referrer_business_id, referred_business_id, reward_months, reward_applied_at
              from public.referrals where referred_business_id = %L $$, :'sam_business'),
  format($$ values (%L::uuid, %L::uuid, 1, null::timestamptz) $$, :'rita_business', :'sam_business'),
  'who sent them is recorded, with a month earned and nothing applied yet'
);
select is(
  (select (after ->> 'code') from public.audit_log
    where action = 'referral.recorded' and entity_id = :'sam_business'),
  :'rita_code',
  'and the audit row says which link it was'
);

-- ---------------------------------------------------------------------------------------
-- What it lets go rather than argues with.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'tom');
select lives_ok(
  $$ select public.create_business('independent', 'Tom Driving', 'NOTACODE') $$,
  'a code nobody has does not stop somebody signing up'
);
select public.create_business('school', 'Tom School', 'ZZZZZZZZ') as tom_school \gset
select tests.clear_authentication();

select is(
  (select count(*)::int from public.referrals r
     join public.businesses b on b.id = r.referred_business_id where b.created_by = :'tom'),
  0,
  'and earns nobody anything'
);

-- Their own code earns them nothing.
select referral_code as tom_code from public.businesses where id = :'tom_school' \gset
select tests.authenticate_as(:'una');
select public.create_business('independent', 'Una Driving', :'tom_code') as una_business \gset
select tests.clear_authentication();
select is(
  (select referrer_business_id from public.referrals where referred_business_id = :'una_business'),
  :'tom_school'::uuid,
  'somebody else''s code is honoured whatever sort of Business it belongs to'
);
select throws_ok(
  format($$ insert into public.referrals (referrer_business_id, referred_business_id, code)
            values (%L, %L, 'AAAAAAAA') $$, :'rita_business', :'rita_business'),
  '23514', null, 'and a Business cannot refer itself'
);
select throws_ok(
  format($$ insert into public.referrals (referrer_business_id, referred_business_id, code)
            values (%L, %L, 'AAAAAAAA') $$, :'tom_school', :'sam_business'),
  '23505', null, 'and a Business is referred once, not by whoever asks second'
);

-- ---------------------------------------------------------------------------------------
-- Who reads it.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'rita');
select results_eq(
  format($$ select (public.my_referrals(%L) ->> 'code'),
                   (public.my_referrals(%L) ->> 'months_earned')::int,
                   jsonb_array_length(public.my_referrals(%L) -> 'joined') $$,
         :'rita_business', :'rita_business', :'rita_business'),
  format($$ values (%L, 1, 1) $$, :'rita_code'),
  'the owner reads their code, what it has earned and who came from it'
);

select tests.authenticate_as(:'sam');
select is(
  (select count(*)::int from public.referrals),
  0,
  'the Business that arrived does not read who sent them'
);
select throws_ok(
  format($$ select public.my_referrals(%L) $$, :'rita_business'),
  '42501', null, 'and nobody reads somebody else''s'
);

select tests.clear_authentication();
select * from finish();
rollback;
