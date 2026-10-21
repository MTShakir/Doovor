-- A paused Business takes no bookings (D-292, D-311): its link is offline, and no slot is open.
begin;
select plan(4);

select tests.create_fixture();

\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'

update public.instructor_profiles set public_slug = 'asha-paused-test', verification_status = 'approved' where id = :'asha';

-- Three days from now at ten: inside the notice and the horizon, whatever the hours say.
create function pg_temp.soon()
returns timestamptz
language sql
as $$ select date_trunc('day', now()) + interval '3 days 10 hours' $$;

select isnt(public.booking_page('asha-paused-test'), null, 'an open Business has its booking link');
select isnt(private.slot_problem(:'asha', pg_temp.soon(), 60), 'BUSINESS_SUSPENDED', 'and is not refused as closed');

update public.businesses set status = 'paused', paused_at = now() where id = :'asha_biz';

select is(public.booking_page('asha-paused-test'), null, 'a paused Business has no booking link');
select is(private.slot_problem(:'asha', pg_temp.soon(), 60), 'BUSINESS_SUSPENDED', 'and every booking is refused, as for a suspended one');

select * from finish();
rollback;
