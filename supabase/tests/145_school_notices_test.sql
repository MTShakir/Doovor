-- Notices about a school's own arrangements (M9-28, D-295): each change queues one event, and the
-- reader says who hears and what about, or nothing once the change is out of date.
begin;
select plan(24);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set manager 'b0000000-0000-0000-0000-000000000002'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set consent 'I agree to Bee School keeping these details and passing them to one of its instructors.'

-- How many events wait to be sent about one row.
create function pg_temp.queued(p_kind text, p_id uuid)
returns integer
language sql
as $$
  select count(*)::int
    from public.outbox_events
   where name = 'school.notice' and payload ->> 'kind' = p_kind and payload ->> 'id' = p_id::text;
$$;

-- Who a notice goes to, as "user audience" lines in order.
create function pg_temp.told(p_notice jsonb)
returns text[]
language sql
as $$
  select coalesce(array_agg((r ->> 'user_id') || ' ' || (r ->> 'audience') order by r ->> 'user_id'), '{}')
    from jsonb_array_elements(p_notice -> 'recipients') as r;
$$;

insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');
select id as link from public.school_links where business_id = :'asha_biz' \gset

-- A pupil offered, and taken.
insert into public.school_enquiries (school_id, full_name, email, postcode, transmission, note, source, consent_wording)
values (:'school', 'Pat Pupil', 'pat@example.com', 'M1 1AE', 'automatic', 'Evenings', 'public', :'consent');
select id as pat from public.school_enquiries where full_name = 'Pat Pupil' \gset

select tests.authenticate_as(:'ben');
select public.offer_school_enquiry(:'pat', array[:'link']::uuid[], 24);
reset role;
select id as offer from public.school_enquiry_offers where enquiry_id = :'pat' \gset

select is(pg_temp.queued('pupil.offered', :'offer'), 1, 'a pupil offered is queued to be told');
select is(
  (select jsonb_build_object('kind', n ->> 'kind', 'told', pg_temp.told(n), 'school', n ->> 'school_name', 'first', n ->> 'learner_name',
                             'area', n ->> 'area', 'gearbox', n ->> 'transmission')
     from public.system_school_notice('pupil.offered', :'offer') as n),
  jsonb_build_object('kind', 'pupil.offered', 'told', array[:'asha_user' || ' instructor'], 'school', 'Bee School', 'first', 'Pat',
                     'area', 'M1', 'gearbox', 'automatic'),
  'to the linked instructor, with only what they see before accepting'
);

select tests.authenticate_as(:'asha_user');
select public.answer_enquiry_offer(:'offer', true);
reset role;
select is(pg_temp.queued('pupil.taken', :'offer'), 1, 'one taken is queued too');
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'pupil', n ->> 'learner_name', 'by', n ->> 'instructor_name')
     from public.system_school_notice('pupil.taken', :'offer') as n),
  jsonb_build_object('told', array[:'ben' || ' school', :'manager' || ' school'], 'pupil', 'Pat Pupil', 'by', 'Asha'),
  'to the school''s owner and managers, and not its instructors'
);
select is(public.system_school_notice('pupil.offered', :'offer'), null, 'an offer already taken is told to nobody');

-- The fees, as set, raised and settled.
select tests.authenticate_as(:'ben');
select public.set_school_fee_terms(:'link', 'weekly', 1500, private.today() + 1, 2, 1000);
select public.set_school_fee_terms(:'link', 'weekly', 1500, private.today() + 1, 2, 1000);
reset role;
select is(pg_temp.queued('school_fee.terms_set', :'link'), 1, 'fee terms set are queued, and the same again is not');
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'school', n ->> 'school_name', 'terms', n -> 'terms')
     from public.system_school_notice('school_fee.terms_set', :'link') as n),
  jsonb_build_object('told', array[:'asha_user' || ' instructor'], 'school', 'Bee School',
                     'terms', jsonb_build_object('period', 'weekly', 'fee_pence', 1500, 'fees_start_on', private.today() + 1,
                                                 'free_weeks', 2, 'pupil_fee_pence', 1000)),
  'to the instructor who pays them, with the terms'
);

select public.system_raise_school_fees(private.today() + 15);
select id as fee from public.school_fees where link_id = :'link' \gset
select is(pg_temp.queued('school_fee.due', :'fee'), 1, 'a fee raised is queued');
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'fee', n -> 'fee') from public.system_school_notice('school_fee.due', :'fee') as n),
  jsonb_build_object('told', array[:'asha_user' || ' instructor'],
                     'fee', jsonb_build_object('kind', 'period', 'amount_pence', 1500, 'period_starts_on', private.today() + 15,
                                               'period_ends_on', private.today() + 21, 'learner_name', null)),
  'with the week it is for'
);

select tests.authenticate_as(:'ben');
select public.settle_school_fee(:'fee', 'paid', 'Bank transfer');
reset role;
select is(pg_temp.queued('school_fee.settled', :'fee'), 1, 'a fee marked paid is queued');
select is(
  (select n ->> 'outcome' from public.system_school_notice('school_fee.settled', :'fee') as n),
  'paid',
  'saying it was paid'
);
select is(public.system_school_notice('school_fee.due', :'fee'), null, 'and is no longer one to say is due');

-- A learner asked whether to move.
insert into public.learner_moves (learner_id, from_business_id, to_business_id, reason)
values (:'lee', :'asha_biz', :'school', 'left_school');
select id as move from public.learner_moves where learner_id = :'lee' \gset
select is(pg_temp.queued('learner.move_asked', :'move'), 1, 'a learner asked to move is queued');
select is(
  (select jsonb_build_object('told', pg_temp.told(n), 'to', n ->> 'school_name', 'from', n ->> 'business_name', 'who', n ->> 'instructor_name',
                             'why', n ->> 'outcome')
     from public.system_school_notice('learner.move_asked', :'move') as n),
  jsonb_build_object('told', array[:'lee' || ' learner'], 'to', 'Bee School', 'from', 'Asha Driving', 'who', 'Asha', 'why', 'left_school'),
  'to the learner, in the names of the choice'
);

-- The link ended by the school: the instructor is the one told.
select tests.authenticate_as(:'ben');
select public.end_school_link(:'link');
reset role;
select is(pg_temp.queued('school.link_ended', :'link'), 1, 'a link ended is queued');
select is(
  (select jsonb_build_object('kind', n ->> 'kind', 'told', pg_temp.told(n), 'why', n ->> 'outcome')
     from public.system_school_notice('school.link_ended', :'link') as n),
  jsonb_build_object('kind', 'school.left', 'told', array[:'asha_user' || ' instructor'], 'why', 'let_go'),
  'to the instructor, when the school ended it'
);
select is(public.system_school_notice('school_fee.terms_set', :'link'), null, 'and terms on a link that ended are told to nobody');

-- An instructor switched off.
select id as ian_member from public.memberships where user_id = :'ian_user' and business_id = :'school' \gset
select tests.authenticate_as(:'ben');
select public.set_member_active(:'ian_member', false);
reset role;
select is(pg_temp.queued('school.member_left', :'ian_member'), 1, 'an instructor switched off is queued');
select is(
  (select jsonb_build_object('kind', n ->> 'kind', 'told', pg_temp.told(n), 'why', n ->> 'outcome', 'paused', n ->> 'business_name')
     from public.system_school_notice('school.member_left', :'ian_member') as n),
  jsonb_build_object('kind', 'school.left', 'told', array[:'ian_user' || ' instructor'], 'why', 'switched_off', 'paused', null),
  'to them, with no Business of their own to open again'
);
update public.users set deleted_at = now() where id = :'ian_user';
select is(
  pg_temp.told(public.system_school_notice('school.member_left', :'ian_member')),
  '{}'::text[],
  'nobody whose account has been deleted since is told'
);

-- A manager switched off, or anybody at a Business that is not a school, is not this notice.
select id as manager_member from public.memberships where user_id = :'manager' and business_id = :'school' \gset
update public.memberships set status = 'deactivated' where id = :'manager_member';
select is(pg_temp.queued('school.member_left', :'manager_member'), 0, 'a manager switched off is not queued as an instructor leaving');

select is(public.system_school_notice('something.else', :'link'), null, 'a kind it does not know is nothing');
select ok(
  not has_function_privilege('authenticated', 'public.system_school_notice(text, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.system_school_notice(text, uuid)', 'execute'),
  'only the jobs read it'
);
select ok(
  (select bool_and(payload ?& array['kind', 'id'] and (select count(*) from jsonb_object_keys(payload)) = 2)
     from public.outbox_events where name = 'school.notice'),
  'every event carries a kind and an id, and nothing else'
);

select * from finish();
rollback;
