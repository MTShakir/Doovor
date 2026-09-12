-- Private notes are private (LRN-04, NFR-SEC-04, M2-06).
--
-- Three ways a learner could reach them, and none of them work: the table itself, any view
-- built on it, and any function that runs as its owner and could hand the text out.
begin;
select plan(12);

select tests.create_fixture();

\set ian_user 'b0000000-0000-0000-0000-000000000003'
\set ivy_user 'b0000000-0000-0000-0000-000000000004'
\set manager_user 'b0000000-0000-0000-0000-000000000002'
\set outsider 'd0000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'

-- ---------------------------------------------------------------------------------------
-- Nothing in the database hands these rows to anybody by another route.
-- ---------------------------------------------------------------------------------------
select is(
  (select count(*)::int
     from pg_depend d
     join pg_rewrite r on r.oid = d.objid
     join pg_class v on v.oid = r.ev_class and v.relkind = 'v'
     join pg_class t on t.oid = d.refobjid and t.relname = 'learner_notes'
     join pg_namespace n on n.oid = t.relnamespace and n.nspname = 'public'
    where v.relname <> 'learner_notes'),
  0,
  'no view is built on the notes table'
);
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and p.prosrc like '%learner_notes%'),
  0,
  'no function running as its owner reads the notes table'
);

-- ---------------------------------------------------------------------------------------
-- The instructor who teaches them writes one.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'ian_user');
select lives_ok(
  $$ insert into public.learner_notes (business_id, learner_id, author_id, body)
     values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
             'b0000000-0000-0000-0000-000000000003', 'Nervous on roundabouts.') $$,
  'the instructor teaching a learner may write a note about them'
);
select is((select count(*)::int from public.learner_notes), 1, 'and read it back');

-- A manager of the same Business can read it: they run the business the note belongs to.
select tests.authenticate_as(:'manager_user');
select is((select count(*)::int from public.learner_notes), 1, 'so can the manager of that Business');

-- Another instructor at the school, who does not teach this learner, cannot.
select tests.authenticate_as(:'ivy_user');
select is(
  (select count(*)::int from public.learner_notes),
  0,
  'an instructor who does not teach them sees nothing'
);

-- ---------------------------------------------------------------------------------------
-- The learner the note is about.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'lee');
select is(
  (select count(*)::int from public.learner_notes),
  0,
  'the learner the note is about cannot read it'
);
select throws_ok(
  $$ insert into public.learner_notes (business_id, learner_id, author_id, body)
     values ('bbbb0000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000001',
             'c0000000-0000-0000-0000-000000000001', 'Let me in') $$,
  '42501', null, 'and cannot write one about themselves to see what happens'
);
-- A write with nothing to write to is not an error, so what matters is how many rows moved.
with changed as (update public.learner_notes set body = 'nothing to see' returning 1)
select count(*)::int as changed_rows from changed \gset
select is(:changed_rows, 0, 'and changes none of them');

with removed as (delete from public.learner_notes returning 1)
select count(*)::int as removed_rows from removed \gset
select is(:removed_rows, 0, 'and deletes none of them');

-- ---------------------------------------------------------------------------------------
-- Everybody else.
-- ---------------------------------------------------------------------------------------
select tests.authenticate_as(:'outsider');
select is((select count(*)::int from public.learner_notes), 0, 'a stranger reads nothing');

-- A visitor with no account is refused before RLS is even consulted: anon holds no grant
-- on this table at all.
select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.learner_notes $$,
  '42501', null, 'a visitor with no account is not allowed to look'
);

select * from finish();
rollback;
