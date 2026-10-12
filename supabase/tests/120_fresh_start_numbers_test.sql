-- Every number the app hands out starts again when the database is emptied for a launch (D-246).
--
-- `pnpm db:fresh` truncates with RESTART IDENTITY, which restarts the sequences owned by a column
-- of a truncated table and skips every other one. A sequence made on its own and used as a default
-- is the one it skips, which is how the founder would have stopped being D000001. This fails the
-- day another such sequence is added, rather than the day after a launch.
begin;
select plan(4);

select is_empty(
  $$ select n.nspname || '.' || c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'S'
        and n.nspname in ('public', 'private')
        and not exists (
          select 1 from pg_depend d
           where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype in ('a', 'i')
        ) $$,
  'every sequence is owned by the column it numbers, so emptying the database restarts it'
);

select is(
  (select attr.attname::text
     from pg_depend d
     join pg_attribute attr on attr.attrelid = d.refobjid and attr.attnum = d.refobjsubid
    where d.objid = 'public.platform_number_seq'::regclass and d.deptype = 'a'),
  'platform_number',
  'the D number belongs to the column that shows it'
);

-- What the launch wipe does to a report number, done here and rolled back with everything else.
-- A truncate inside a transaction restarts its sequences inside it too, and puts them back with
-- the rollback.
insert into public.feedback_submissions (user_id, kind, message)
select id, 'other', 'Before the wipe' from auth.users limit 1;

truncate public.feedback_submissions restart identity;

insert into public.feedback_submissions (user_id, kind, message)
select id, 'other', 'The first after it' from auth.users limit 1;

select is(
  (select reference from public.feedback_submissions where message = 'The first after it'),
  'R01',
  'the first report after a launch wipe is R01'
);
select is(
  (select count(*)::int from public.feedback_submissions),
  1,
  'and nothing from before it is left'
);

select * from finish();
rollback;
