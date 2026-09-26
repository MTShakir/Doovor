-- Free carries ten learners at a time (D-208).
begin;
select plan(12);

select tests.create_fixture();

\set asha_business 'aaaa0000-0000-0000-0000-000000000000'
\set bee_business 'bbbb0000-0000-0000-0000-000000000000'
\set asha 'a0000000-0000-0000-0000-000000000001'

-- A clean slate for the count, then learners to fill it with.
delete from public.learner_relationships where business_id = :'asha_business';
update public.businesses set plan = 'free' where id = :'asha_business';
update public.businesses set plan = 'school' where id = :'bee_business';

do $$
declare
  v_id uuid;
begin
  for i in 1..14 loop
    v_id := ('e1000000-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    perform tests.create_user_with_id(v_id, 'cap.learner.' || i || '@test.local', 'Cap Learner ' || i);
    insert into public.learner_profiles (user_id, transmission) values (v_id, 'manual');
  end loop;
end;
$$;

/** Takes a learner on at a Business, giving back the error if it was refused. */
create or replace function pg_temp.take_on(p_business uuid, p_number integer, p_status text default 'active')
returns text
language plpgsql
as $$
begin
  insert into public.learner_relationships (business_id, learner_id, status)
  values (p_business,
          ('e1000000-0000-0000-0000-0000000000' || lpad(p_number::text, 2, '0'))::uuid,
          p_status::public.learner_status);
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Ten fit. The eleventh does not.
-- ---------------------------------------------------------------------------------------
do $$
begin
  for i in 1..10 loop
    perform pg_temp.take_on('aaaa0000-0000-0000-0000-000000000000'::uuid, i);
  end loop;
end;
$$;

select is(
  (select count(*)::int from public.learner_relationships where business_id = :'asha_business'),
  10,
  'ten learners go on the books'
);
select is(
  pg_temp.take_on(:'asha_business'::uuid, 11),
  'LEARNER_LIMIT',
  'and the eleventh is refused'
);

-- ---------------------------------------------------------------------------------------
-- What does not count against it.
-- ---------------------------------------------------------------------------------------
select is(
  pg_temp.take_on(:'asha_business'::uuid, 11, 'enquiry'),
  'ok',
  'an enquiry is not work, so it does not take a place'
);
select is(
  pg_temp.take_on(:'asha_business'::uuid, 12, 'passed'),
  'ok',
  'and neither does somebody who has passed'
);
select is(
  pg_temp.take_on(:'asha_business'::uuid, 13, 'left'),
  'ok',
  'and neither does somebody who has left'
);

-- ---------------------------------------------------------------------------------------
-- The way round it, closed.
-- ---------------------------------------------------------------------------------------
select throws_ok(
  format($$ update public.learner_relationships set status = 'active'
             where business_id = %L and learner_id = 'e1000000-0000-0000-0000-000000000012' $$, :'asha_business'),
  'P0001', 'LEARNER_LIMIT',
  'somebody who passed cannot be brought back on while the books are full'
);

-- ---------------------------------------------------------------------------------------
-- Nobody already on the books is touched by it.
-- ---------------------------------------------------------------------------------------
update public.platform_settings set value = '{"active_learners": 3}' where key = 'free_plan_limits';
select is(
  (select count(*)::int from public.learner_relationships
    where business_id = :'asha_business' and status = 'active'),
  10,
  'lowering the number takes nobody off the books'
);
select lives_ok(
  format($$ update public.learner_relationships set usual_duration_minutes = 90
             where business_id = %L and learner_id = 'e1000000-0000-0000-0000-000000000001' $$, :'asha_business'),
  'and somebody over the number can still be worked with'
);
update public.platform_settings set value = '{"active_learners": 10}' where key = 'free_plan_limits';

-- ---------------------------------------------------------------------------------------
-- A paid plan is not counted at all.
-- ---------------------------------------------------------------------------------------
do $$
begin
  for i in 1..14 loop
    perform pg_temp.take_on('bbbb0000-0000-0000-0000-000000000000'::uuid, i);
  end loop;
end;
$$;
-- Counting the ones this test took on, since the fixture put its own there first.
select is(
  (select count(*)::int from public.learner_relationships
    where business_id = :'bee_business' and status = 'active'
      and learner_id::text like 'e1000000-%'),
  14,
  'a paid plan carries as many as it likes'
);

-- ---------------------------------------------------------------------------------------
-- What the screens read, so a number can be shown before anybody is refused.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'asha');
select results_eq(
  format($$ select (public.learner_allowance(%L) ->> 'on_books')::int,
                   (public.learner_allowance(%L) ->> 'limit')::int $$, :'asha_business', :'asha_business'),
  $$ values (10, 10) $$,
  'an instructor on Free reads how many they carry and how many they may'
);
select throws_ok(
  format($$ select public.learner_allowance(%L) $$, :'bee_business'),
  '42501', null, 'and nobody reads a Business they are not in'
);

select tests.authenticate_as('b0000000-0000-0000-0000-000000000001');
select is(
  (public.learner_allowance(:'bee_business') ->> 'limit'),
  null,
  'and a Business on a paid plan has no number at all'
);

select tests.clear_authentication();
select * from finish();
rollback;
