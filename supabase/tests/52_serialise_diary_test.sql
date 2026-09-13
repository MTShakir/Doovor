-- Bookings into one diary take turns (BOK-07, R-02, R-03).
--
-- Two sessions cannot race inside one pgTAP transaction, so this checks the part that makes
-- them take turns: the locks are taken by the changes that can make lessons overlap, and not by
-- the ones that cannot. The race itself is acceptance-02, in the end to end suite.
begin;
select plan(4);

select tests.create_fixture();

\set ian 'b1000000-0000-0000-0000-000000000001'
\set lee 'c0000000-0000-0000-0000-000000000001'
\set school 'bbbb0000-0000-0000-0000-000000000000'
\set lesson_type 'b2000000-0000-0000-0000-000000000001'

select has_trigger('public', 'bookings', 'bookings_serialise_diary', 'bookings into one diary take turns');

create or replace function pg_temp.diary_locks() returns integer language sql as $$
  select count(*)::int from pg_locks
   where locktype = 'advisory' and pid = pg_backend_pid() and granted;
$$;

select is(pg_temp.diary_locks(), 0, 'nothing holds the diary before a lesson is written');

insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                             buffer_minutes, status, price_pence, source)
values (:'school', :'ian', :'lee', :'lesson_type', now() + interval '9 days', now() + interval '9 days 1 hour',
        30, 'confirmed', 4200, 'instructor');

select is(pg_temp.diary_locks(), 2, 'writing a lesson takes the diary of the instructor and of the learner, until the end');

select is(
  (select count(*)::int from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
    where c.relname = 'bookings' and t.tgname = 'bookings_serialise_diary'
      and pg_get_triggerdef(t.oid) like '%UPDATE OF starts_at, ends_at, buffer_minutes, instructor_id, learner_id, status%'),
  1,
  'and only changes that can make lessons overlap take it'
);

select * from finish();
rollback;
