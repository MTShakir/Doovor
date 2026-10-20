-- What a linked instructor pays the school: set by the school, read by both (M9-11, D-287).
begin;
select plan(15);

select tests.create_fixture();

\set ben 'b0000000-0000-0000-0000-000000000001'
\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set asha_user 'a0000000-0000-0000-0000-000000000001'
\set otto 'd0000000-0000-0000-0000-000000000001'
\set asha_biz 'aaaa0000-0000-0000-0000-000000000000'
\set school 'bbbb0000-0000-0000-0000-000000000000'

insert into public.school_links (school_id, business_id) values (:'school', :'asha_biz');
select id as link from public.school_links where business_id = :'asha_biz' \gset

select tests.authenticate_as(:'ben');
select lives_ok(
  format($$ select public.set_school_fee_terms(%L, 'weekly', 5000, private.today() + 3, 1, 2000) $$, :'link'),
  'the owner charges £50 a week from three days on, the first week free, and £20 for each pupil sent'
);
select is(
  (select array[fee_pence, free_weeks, pupil_fee_pence] from public.school_links where id = :'link'),
  array[5000, 1, 2000],
  'and the link keeps the terms'
);

select tests.authenticate_as(:'asha_user');
select is(
  (select fee_period::text || ' ' || fee_pence from public.school_links where id = :'link'),
  'weekly 5000',
  'the instructor reads what she pays'
);
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'weekly', 100, private.today() + 3) $$, :'link'),
  'NOT_ALLOWED',
  'and cannot change it'
);
select tests.authenticate_as(:'ian_user');
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'weekly', 100, private.today() + 3) $$, :'link'),
  'NOT_ALLOWED',
  'nor can an instructor at the school'
);
select tests.authenticate_as(:'otto');
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'weekly', 100, private.today() + 3) $$, :'link'),
  'NOT_ALLOWED',
  'nor anybody else'
);

select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, null, 5000, null) $$, :'link'),
  'VALIDATION_FAILED',
  'a fee needs to say how often'
);
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'monthly', 5000, null) $$, :'link'),
  'VALIDATION_FAILED',
  'and from when'
);
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'monthly', 20000, private.today() - 1) $$, :'link'),
  'VALIDATION_FAILED',
  'a new schedule cannot start in the past'
);
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'weekly', 5000, private.today() + 3, 53) $$, :'link'),
  'VALIDATION_FAILED',
  'nor have more than a year free'
);
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'weekly', 5000, private.today() + 3, 1, 50) $$, :'link'),
  'VALIDATION_FAILED',
  'a fee for a pupil is at least £1'
);
select lives_ok(
  format($$ select public.set_school_fee_terms(%L, null, null, null, 0, 2500) $$, :'link'),
  'a school may charge for pupils alone'
);
select is(
  (select array[fee_period::text, pupil_fee_pence::text] from public.school_links where id = :'link'),
  array[null, '2500'],
  'with no weekly or monthly fee'
);

reset role;
select is(
  (select count(*)::int from public.audit_log where action = 'school.fee_terms_set' and entity_id = :'link'),
  2,
  'each change is written down'
);

update public.school_links set status = 'ended', ended_at = now(), end_reason = 'left', ended_by = :'asha_user' where id = :'link';
select tests.authenticate_as(:'ben');
select throws_ok(
  format($$ select public.set_school_fee_terms(%L, 'weekly', 5000, private.today() + 3) $$, :'link'),
  'NOT_FOUND',
  'a link that has ended has no terms to change'
);

select * from finish();
rollback;
