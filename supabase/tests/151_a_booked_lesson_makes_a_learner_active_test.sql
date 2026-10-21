-- A booked lesson makes a learner active (LRN-05, D-315), and never turns a lesson away over the Free limit (D-208).
begin;
select plan(8);

select tests.create_fixture();

\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set lesson 'a2000000-0000-0000-0000-000000000001'
\set lou 'c0000000-0000-0000-0000-000000000002'
\set liz 'c0000000-0000-0000-0000-000000000003'

create function pg_temp.book(p_learner uuid, p_status public.booking_status, p_days integer)
returns uuid language sql as $$
  insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                               buffer_minutes, status, price_pence, source, expires_at)
  values ('aaaa0000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', p_learner,
          'a2000000-0000-0000-0000-000000000001', date_trunc('hour', now()) + make_interval(days => p_days, hours => 10),
          date_trunc('hour', now()) + make_interval(days => p_days, hours => 11), 30, p_status, 4200, 'instructor',
          case when p_status = 'requested' then now() + interval '12 hours' end)
  returning id;
$$;

create function pg_temp.status_of(p_learner uuid)
returns text language sql as $$
  select status::text from public.learner_relationships
   where business_id = 'aaaa0000-0000-0000-0000-000000000000' and learner_id = p_learner;
$$;

-- Lou accepted an invitation, so is an enquiry.
insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source)
values (:'asha_biz', :'lou', :'asha', 'enquiry', 'invite');

select pg_temp.book(:'lou', 'requested', 3) as asked \gset
select is(pg_temp.status_of(:'lou'), 'enquiry', 'a lesson only asked for leaves an enquiry as it is');

update public.bookings set status = 'confirmed' where id = :'asked';
select is(pg_temp.status_of(:'lou'), 'active', 'once it is confirmed, the enquiry is active');
select is(
  (select after from public.audit_log where action = 'learner.status_changed' and entity_id =
     (select id from public.learner_relationships where business_id = :'asha_biz' and learner_id = :'lou')),
  '{"status": "active", "because": "booked"}'::jsonb,
  'and the move is written down, saying a lesson was booked'
);

-- Somebody who has left is not brought back by a lesson.
update public.learner_relationships set status = 'left' where business_id = :'asha_biz' and learner_id = :'lou';
select pg_temp.book(:'lou', 'confirmed', 4);
select is(pg_temp.status_of(:'lou'), 'left', 'somebody who has left stays left');

-- Free with no room: an enquiry stays one, and the lesson stands.
update public.businesses set plan = 'free' where id = :'asha_biz';
update public.platform_settings set value = '{"active_learners": 1}' where key = 'free_plan_limits';
insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source)
values (:'asha_biz', :'liz', :'asha', 'enquiry', 'invite');
select lives_ok(
  $$ select pg_temp.book('c0000000-0000-0000-0000-000000000003', 'confirmed', 5) $$,
  'on Free with no room left, a lesson for an enquiry is still booked'
);
select is(pg_temp.status_of(:'liz'), 'enquiry', 'and the learner stays an enquiry rather than going over the limit');

-- Waiting is already counted, so it moves whatever the room: Lee and Liz on the books, with room for one.
update public.platform_settings set value = '{"active_learners": 2}' where key = 'free_plan_limits';
update public.learner_relationships set status = 'waiting' where business_id = :'asha_biz' and learner_id = :'liz';
update public.platform_settings set value = '{"active_learners": 1}' where key = 'free_plan_limits';
select pg_temp.book(:'liz', 'confirmed', 6);
select is(pg_temp.status_of(:'liz'), 'active', 'somebody waiting is active once booked, room or not');

select ok(
  not has_function_privilege('authenticated', 'private.booked_learner_is_active()', 'execute'),
  'nobody calls the trigger function themselves'
);

select * from finish();
rollback;
