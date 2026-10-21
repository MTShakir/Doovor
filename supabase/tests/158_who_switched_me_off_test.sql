-- Somebody a school switched off is told which school, though they can no longer read it
-- (SCH-02, D-332).
begin;
select plan(6);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian 'b0000000-0000-0000-0000-000000000003'

-- Teaching there, Ian has been switched off by nobody.
select tests.authenticate_as(:'ian');
select is(public.my_switched_off_by(), '{}'::text[], 'an instructor teaching at the school has been switched off by nobody');

-- Bee School switches him off.
reset role;
update public.memberships set status = 'deactivated' where business_id = :'school' and user_id = :'ian';
select tests.authenticate_as(:'ian');
select is(public.my_switched_off_by(), array['Bee School'], 'switched off, he is told which school');
select is((select count(*)::int from public.businesses where id = :'school'), 0, 'which he can no longer read for himself');

-- Only ever about the person asking.
select tests.authenticate_as(:'manager');
select is(public.my_switched_off_by(), '{}'::text[], 'the manager still there hears nothing about him');

-- A school suspended by the platform says so on its own page, not this one.
reset role;
update public.businesses set status = 'suspended' where id = :'school';
select tests.authenticate_as(:'ian');
select is(public.my_switched_off_by(), '{}'::text[], 'nor is a suspended school named');

-- Nobody signed out asks it.
reset role;
set local role anon;
select throws_ok('select public.my_switched_off_by()', '42501', null, 'nobody signed out can ask');

select * from finish();
rollback;
