-- Joining a school with a business of one's own pauses it and asks its learners whether to move;
-- leaving, it opens again; a linked instructor leaving asks the learners the school introduced
-- (M9-23 to M9-25, D-292).
begin;
select plan(21);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha 'a1000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set liz 'c0000000-0000-0000-0000-000000000003'
\set mia 'c0000000-0000-0000-0000-000000000142'

-- Asha runs her own Business. Liz learns with her alone; Lee learns with her and at Bee School
-- already. Bee School invites her to teach under it.
insert into public.learner_relationships (business_id, learner_id, instructor_id) values (:'asha_biz', :'liz', :'asha');
select tests.authenticate_as(:'ben');
select token as asha_token from public.invite_member(:'school', 'instructor', 'link', 'Asha', null, null) \gset

-- Not while she has a lesson to come.
reset role;
insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, price_pence, source)
values (:'asha_biz', :'asha', :'lee', 'a2000000-0000-0000-0000-000000000001',
        (private.today() + 4 + time '10:00') at time zone 'Europe/London',
        (private.today() + 4 + time '11:00') at time zone 'Europe/London', 30, 'confirmed', 4500, 'instructor');
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.accept_member_invitation(%L) $$, :'asha_token'),
  'VALIDATION_FAILED',
  'she cannot join with a lesson still to come on her own business'
);

-- Nor while a learner holds hours they paid her for.
reset role;
delete from public.bookings where business_id = :'asha_biz';
insert into public.credit_accounts (business_id, learner_id) values (:'asha_biz', :'lee') on conflict do nothing;
insert into public.credit_lots (id, business_id, learner_id, minutes_total, price_pence)
values ('cccc0000-0000-0000-0000-000000000142', :'asha_biz', :'lee', 60, 4000);
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, reason, actor_id)
values (:'asha_biz', :'lee', 'cccc0000-0000-0000-0000-000000000142', 'adjustment', 60, 'An hour given', :'asha_user');
select tests.authenticate_as(:'asha_user');
select throws_ok(
  format($$ select public.accept_member_invitation(%L) $$, :'asha_token'),
  'VALIDATION_FAILED',
  'nor with hours a learner paid for still to use'
);

-- With neither, she joins, and her own Business pauses.
reset role;
insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, reason, actor_id)
values (:'asha_biz', :'lee', 'cccc0000-0000-0000-0000-000000000142', 'adjustment', -60, 'Taught out', :'asha_user');
select tests.authenticate_as(:'asha_user');
select lives_ok(format($$ select public.accept_member_invitation(%L) $$, :'asha_token'), 'she joins the school');
reset role;
select is(
  (select array[status::text, paused_for::text] from public.businesses where id = :'asha_biz'),
  array['paused', :'school'],
  'her own Business is paused for the school'
);
select is(
  (select array[m.role::text, m.status::text, (p.id is not null)::text]
     from public.memberships m left join public.instructor_profiles p on p.business_id = m.business_id and p.user_id = m.user_id
    where m.business_id = :'school' and m.user_id = :'asha_user'),
  array['instructor', 'active', 'true'],
  'and she teaches under it'
);
select is((select count(*)::int from public.audit_log where action = 'business.paused' and entity_id = :'asha_biz'), 1, 'which is written down');

-- Liz is asked whether to move with her, and chooses; Lee, at the school already, is not asked.
-- Her school profile carries the name her own one had (D-324).
select tests.authenticate_as(:'liz');
select is(
  (select jsonb_build_object('reason', x ->> 'reason', 'from', x ->> 'fromName', 'to', x ->> 'toName', 'with', x ->> 'instructorName')
     from jsonb_array_elements(public.learner_moves_for_me()) as x),
  '{"reason": "joined_school", "from": "Asha Driving", "to": "Bee School", "with": "Asha"}'::jsonb,
  'Liz is asked whether to move to the school with Asha'
);
select tests.authenticate_as(:'lee');
select is(jsonb_array_length(public.learner_moves_for_me()), 0, 'Lee, a learner at the school already, has nothing to choose');
select throws_ok(
  $$ select public.answer_learner_move((select id from public.learner_moves where learner_id = 'c0000000-0000-0000-0000-000000000003'), true) $$,
  'NOT_FOUND',
  'nor answers for Liz'
);
select tests.authenticate_as(:'liz');
select lives_ok(
  $$ select public.answer_learner_move((select id from public.learner_moves where learner_id = 'c0000000-0000-0000-0000-000000000003'), true) $$,
  'Liz moves'
);
reset role;
select is(
  (select array[r.status::text, p.user_id::text] from public.learner_relationships r
     join public.instructor_profiles p on p.id = r.instructor_id
    where r.business_id = :'school' and r.learner_id = :'liz'),
  array['active', :'asha_user'],
  'and is the school''s learner, with Asha'
);
select tests.authenticate_as(:'liz');
select throws_ok(
  $$ select public.answer_learner_move((select id from public.learner_moves where learner_id = 'c0000000-0000-0000-0000-000000000003'), false) $$,
  'VALIDATION_FAILED',
  'once answered, the choice is made'
);

-- While she teaches under the school, her own Business stays paused.
select tests.authenticate_as(:'asha_user');
select is((public.my_paused_business() ->> 'name'), 'Asha Driving', 'she can see the Business she paused');
select throws_ok(
  format($$ select public.reopen_own_business(%L) $$, :'asha_biz'),
  'VALIDATION_FAILED',
  'and cannot open it while she teaches under the school'
);

-- The school switches her off; she opens her own Business again.
reset role;
update public.memberships set status = 'deactivated' where business_id = :'school' and user_id = :'asha_user';
select tests.authenticate_as(:'asha_user');
select lives_ok(format($$ select public.reopen_own_business(%L) $$, :'asha_biz'), 'having left, she opens her own Business again');
reset role;
select is((select status::text from public.businesses where id = :'asha_biz'), 'active', 'and it takes bookings again');
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.reopen_own_business(%L) $$, :'asha_biz'),
  'NOT_FOUND',
  'nobody else opens it'
);

-- A linked instructor who leaves: the learners the school introduced are asked whether to come back.
reset role;
select tests.create_user_with_id(:'mia', 'mia@test.local', 'Mia Pupil');
insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');
insert into public.learner_relationships (business_id, learner_id, instructor_id, introduced_by)
values (:'asha_biz', :'mia', :'asha', :'school');
update public.school_links set status = 'ended', ended_at = now(), end_reason = 'left', ended_by = :'asha_user'
 where business_id = :'asha_biz' and status = 'active';
select tests.authenticate_as(:'mia');
select is(
  (select jsonb_build_object('reason', x ->> 'reason', 'to', x ->> 'toName', 'with', x -> 'instructorName')
     from jsonb_array_elements(public.learner_moves_for_me()) as x),
  '{"reason": "left_school", "to": "Bee School", "with": null}'::jsonb,
  'Mia, whom the school introduced, is asked whether to go back to it'
);
select tests.authenticate_as(:'liz');
select is(jsonb_array_length(public.learner_moves_for_me()), 0, 'Liz, who came to Asha herself, is not');
select tests.authenticate_as(:'mia');
select lives_ok(
  $$ select public.answer_learner_move((select id from public.learner_moves where learner_id = 'c0000000-0000-0000-0000-000000000142' and reason = 'left_school'), false) $$,
  'Mia stays with Asha'
);
reset role;
select is(
  (select array[(select status::text from public.learner_moves where learner_id = :'mia' and reason = 'left_school'),
                (select count(*)::text from public.learner_relationships where business_id = :'asha_biz' and learner_id = :'mia')]),
  array['stayed', '1'],
  'and she does'
);

select * from finish();
rollback;
