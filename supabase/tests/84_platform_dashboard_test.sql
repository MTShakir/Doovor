-- The admin dashboard (ADM-01, M5-17).
--
-- The figures are held at a moment long before anything real happened, 10 March 2021, so the only
-- rows in its 30 days are the ones made here. Counts that are not about those days (Businesses in
-- good standing, badges waiting, disputes open) are checked by how much they move.
begin;
select plan(12);

select tests.create_fixture();

\set school 'bbbb0000-0000-0000-0000-000000000000'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian 'b1000000-0000-0000-0000-000000000001'
\set ivy 'b1000000-0000-0000-0000-000000000002'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'
\set staff 'e0000000-0000-0000-0000-000000000010'
\set now '2021-03-10T12:00:00Z'

select private.platform_dashboard_facts(:'now') as before \gset

-- Sign-ups in the 30 days: two learners and an instructor who confirmed, a school owner who signed up
-- by phone, a learner who never confirmed, and somebody who has not chosen a role.
select tests.create_user_with_id('e1000000-0000-0000-0000-000000000001', 'new.learner1@test.local', 'New One');
select tests.create_user_with_id('e1000000-0000-0000-0000-000000000002', 'new.learner2@test.local', 'New Two');
select tests.create_user_with_id('e1000000-0000-0000-0000-000000000003', 'new.instructor@test.local', 'New Three');
select tests.create_user_with_id('e1000000-0000-0000-0000-000000000004', 'new.school@test.local', 'New Four');
select tests.create_user_with_id('e1000000-0000-0000-0000-000000000005', 'unconfirmed@test.local', 'New Five');
select tests.create_user_with_id('e1000000-0000-0000-0000-000000000006', 'undecided@test.local', 'New Six');
select tests.create_user_with_id('e1000000-0000-0000-0000-000000000007', 'too.early@test.local', 'New Seven');
update public.users set created_at = '2021-03-01T09:00:00Z', email_verified_at = '2021-03-01T09:05:00Z', intended_role = 'learner'
 where id in ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002');
update public.users set created_at = '2021-02-10T12:00:00Z', email_verified_at = '2021-02-10T12:05:00Z', intended_role = 'instructor'
 where id = 'e1000000-0000-0000-0000-000000000003';
update public.users set created_at = '2021-03-10T11:00:00Z', email_verified_at = null, phone_verified_at = '2021-03-10T11:01:00Z', intended_role = 'school'
 where id = 'e1000000-0000-0000-0000-000000000004';
update public.users set created_at = '2021-03-02T09:00:00Z', email_verified_at = null, phone_verified_at = null, intended_role = 'learner'
 where id = 'e1000000-0000-0000-0000-000000000005';
update public.users set created_at = '2021-03-03T09:00:00Z', email_verified_at = '2021-03-03T09:00:00Z', intended_role = null
 where id = 'e1000000-0000-0000-0000-000000000006';
update public.users set created_at = '2021-02-08T11:59:00Z', email_verified_at = '2021-02-08T12:00:00Z', intended_role = 'learner'
 where id = 'e1000000-0000-0000-0000-000000000007';

-- Businesses: Asha's is suspended.
update public.businesses set status = 'suspended' where id = :'asha_biz';

-- Lessons at the school: booked in the 30 days and completed in them, one called off after it was
-- booked, one declined, and one completed in the 30 days that was booked long before.
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status, price_pence, source, created_at) values
  (:'school', :'ian', :'lee', :'lesson_type', '2021-03-05T10:00:00Z', '2021-03-05T11:00:00Z', 0, 'completed', 'paid_card', 4200, 'instructor', '2021-03-01T10:00:00Z'),
  (:'school', :'ian', :'lee', :'lesson_type', '2021-03-12T10:00:00Z', '2021-03-12T11:00:00Z', 0, 'cancelled', 'unpaid', 4200, 'instructor', '2021-03-02T10:00:00Z'),
  (:'school', :'ivy', :'lou', :'lesson_type', '2021-03-15T10:00:00Z', '2021-03-15T11:00:00Z', 0, 'declined', 'unpaid', 4200, 'self', '2021-03-03T10:00:00Z'),
  (:'school', :'ivy', :'lou', :'lesson_type', '2021-03-08T10:00:00Z', '2021-03-08T11:00:00Z', 0, 'completed', 'unpaid', 4400, 'instructor', '2021-01-15T10:00:00Z');
select id as paid_lesson from public.bookings where business_id = :'school' and starts_at = '2021-03-05T10:00:00Z' \gset

-- Money: £42 by card with a 50p platform fee, a £380 package in cash, a refund of £10, and a payment
-- the day before the 30 days began.
insert into public.payments (business_id, learner_id, booking_id, provider, amount_pence, fee_pence, method, status, paid_at) values
  (:'school', :'lee', :'paid_lesson', 'stripe', 4200, 50, 'card', 'paid', '2021-03-05T11:00:00Z'),
  (:'school', :'lou', null, 'offline', 38000, 0, 'cash', 'paid', '2021-03-06T09:00:00Z'),
  (:'school', :'lou', null, 'offline', 9900, 0, 'cash', 'paid', '2021-02-08T11:00:00Z');
select id as card_payment from public.payments where booking_id = :'paid_lesson' \gset
insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, amount_pence, reason, status, settled_at)
values (:'school', :'card_payment', :'paid_lesson', :'lee', 'card', 1000, 'Cut short', 'succeeded', '2021-03-07T09:00:00Z');

-- A badge waiting, and a dispute waiting.
update public.instructor_profiles set verification_status = 'pending', verification_submitted_at = '2021-03-04T09:00:00Z' where id = :'ivy';
insert into public.no_show_disputes (business_id, booking_id, learner_id, reason)
values (:'school', :'paid_lesson', :'lee', 'I was there');

select private.platform_dashboard_facts(:'now') as after \gset

create or replace function pg_temp.moved(p_before jsonb, p_after jsonb, p_path text[]) returns integer language sql as $$
  select ((p_after #>> p_path)::numeric - (p_before #>> p_path)::numeric)::integer;
$$;

select results_eq(
  format($$ select (f #>> '{signups,learners}')::int, (f #>> '{signups,instructors}')::int, (f #>> '{signups,schools}')::int, (f #>> '{signups,undecided}')::int
              from (select %L::jsonb as f) as x $$, :'after'),
  $$ values (2, 1, 1, 1) $$,
  'sign-ups in the 30 days are confirmed accounts, by the role chosen, with a phone counting as confirmed, and not one confirmed a minute too early (ADM-01)'
);
select results_eq(
  format($$ select (f #>> '{lessons,booked}')::int, (f #>> '{lessons,completed}')::int from (select %L::jsonb as f) as x $$, :'after'),
  $$ values (2, 2) $$,
  'two lessons were booked in the 30 days, one of them later called off, and two were completed in them'
);
select results_eq(
  format($$ select (f #>> '{money,gmv_pence}')::int, (f #>> '{money,card_pence}')::int, (f #>> '{money,fees_pence}')::int,
                  (f #>> '{money,payments}')::int, (f #>> '{money,refunds_pence}')::int
              from (select %L::jsonb as f) as x $$, :'after'),
  $$ values (42200, 4200, 50, 2, 1000) $$,
  '£422 went through Businesses'' accounts in two payments, £42 of it by card, with 50p to the platform and £10 given back'
);
select is(pg_temp.moved(:'before', :'after', '{businesses,active}'), -1, 'a Business suspended is no longer active');
select is(pg_temp.moved(:'before', :'after', '{businesses,independent}'), -1, 'and it was a Business of one');
select is(pg_temp.moved(:'before', :'after', '{businesses,suspended}'), 1, 'and is counted as suspended');
select is(pg_temp.moved(:'before', :'after', '{businesses,teaching}'), 1, 'the school is teaching in the 30 days');
select is(pg_temp.moved(:'before', :'after', '{verification,waiting}'), 1, 'one more badge waits to be checked');
select is(pg_temp.moved(:'before', :'after', '{disputes,open}'), 1, 'and one more dispute waits for a decision');

-- ---------------------------------------------------------------------------------------
-- Who may see it.
-- ---------------------------------------------------------------------------------------
select tests.create_user_with_id(:'staff', 'support@test.local', 'Sam Support');
insert into public.platform_staff (user_id, role) values (:'staff', 'support_admin');
select tests.authenticate_as(:'staff', 'aal2');
select lives_ok($$ select public.platform_dashboard() $$, 'support staff past their second step see the dashboard');
select tests.authenticate_as(:'staff');
select throws_ok($$ select public.platform_dashboard() $$, '42501', null, 'but not before it (AUTH-08)');
select tests.authenticate_as(:'ben', 'aal2');
select throws_ok($$ select public.platform_dashboard() $$, '42501', null, 'and the owner of a school does not');

select * from finish();
rollback;
