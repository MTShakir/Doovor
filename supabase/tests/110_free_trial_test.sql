-- The free trial: ninety days for the first five hundred, thirty after that (D-204).
begin;
select plan(9);

select tests.create_user('anna.trial@test.local', 'Anna Trial') as anna \gset
select tests.create_user('bilal.trial@test.local', 'Bilal Trial') as bilal \gset
select tests.create_user('cleo.trial@test.local', 'Cleo Trial') as cleo \gset
select tests.create_user('dev.trial@test.local', 'Dev Trial') as dev \gset

-- ---------------------------------------------------------------------------------------
-- A founding place is still a founding place.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'anna');
select public.create_business('independent', 'Anna Driving') as anna_business \gset
select tests.clear_authentication();

select results_eq(
  format($$ select plan::text, founding_offer, trial_given from public.businesses where id = %L $$, :'anna_business'),
  $$ values ('pro', true, false) $$,
  'while places remain it is the founding offer, and not a trial'
);

-- ---------------------------------------------------------------------------------------
-- Out of founding places: the long trial.
-- ---------------------------------------------------------------------------------------
update public.platform_settings set value = jsonb_set(value, '{instructor_limit}', '0') where key = 'founding_offer';
update public.platform_settings set value = jsonb_set(value, '{school_limit}', '0') where key = 'founding_offer';

select tests.authenticate_as(:'bilal');
select public.create_business('independent', 'Bilal Driving') as bilal_business \gset
select tests.clear_authentication();

select results_eq(
  format($$ select plan::text, founding_offer, trial_given from public.businesses where id = %L $$, :'bilal_business'),
  $$ values ('pro', false, true) $$,
  'the next one gets the paid plan as a trial'
);
select ok(
  (select plan_expires_at between now() + interval '89 days' and now() + interval '91 days'
     from public.businesses where id = :'bilal_business'),
  'and it runs for ninety days'
);
select is(
  (select (after ->> 'trial')::boolean from public.audit_log where entity_id = :'bilal_business' and action = 'business.created'),
  true,
  'and the audit row says it was a trial'
);

-- ---------------------------------------------------------------------------------------
-- Out of long trials: the short one.
-- ---------------------------------------------------------------------------------------
update public.platform_settings set value = jsonb_set(value, '{first}', '1') where key = 'free_trial';

select tests.authenticate_as(:'cleo');
select public.create_business('school', 'Cleo School') as cleo_business \gset
select tests.clear_authentication();

select results_eq(
  format($$ select plan::text, founding_offer, trial_given from public.businesses where id = %L $$, :'cleo_business'),
  $$ values ('school', false, true) $$,
  'a school past the first five hundred is on the School plan, still as a trial'
);
select ok(
  (select plan_expires_at between now() + interval '29 days' and now() + interval '31 days'
     from public.businesses where id = :'cleo_business'),
  'and it runs for thirty days'
);

-- ---------------------------------------------------------------------------------------
-- No trial at all: Free, with nothing to expire.
-- ---------------------------------------------------------------------------------------
update public.platform_settings set value = '{"first": 0, "long_days": 0, "short_days": 0}' where key = 'free_trial';

select tests.authenticate_as(:'dev');
select public.create_business('independent', 'Dev Driving') as dev_business \gset
-- The columns that say what a Business pays are not readable from a session (D-123).
select tests.clear_authentication();

select results_eq(
  format($$ select plan::text, plan_expires_at, founding_offer, trial_given from public.businesses where id = %L $$, :'dev_business'),
  $$ values ('free'::text, null::timestamptz, false, false) $$,
  'with the trial switched off it is Free, and there is no date to run out'
);

-- ---------------------------------------------------------------------------------------
-- What the owner reads about it.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'dev');
select results_eq(
  format($$ select plan::text, founding_offer, trial_given from public.business_billing(%L) $$, :'dev_business'),
  $$ values ('free', false, false) $$,
  'the owner reads their own plan, and whether it is a trial'
);

select tests.authenticate_as(:'anna');
select throws_ok(
  format($$ select * from public.business_billing(%L) $$, :'dev_business'),
  '42501', null, 'and nobody reads somebody else''s'
);

select tests.clear_authentication();
select * from finish();
rollback;
