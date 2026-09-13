-- Two people booking the same time at the same moment get one lesson and one clear answer
-- (BOK-07, R-02, R-03, acceptance-02).
--
-- The exclusion constraints decide who gets a slot. But two transactions that insert
-- overlapping lessons at exactly the same moment each put their row in the index and then
-- wait for the other to finish before checking it, and Postgres breaks that circle by killing
-- one of them with "deadlock detected". The learner who lost is then told something went wrong
-- instead of that the slot has just gone. It happened on the CI runners, which are fast enough
-- to hit the same instant.
--
-- Every change that can make lessons overlap now takes a lock on the instructor's diary and on
-- the learner first, always in that order, before the row is written. The second one waits,
-- the first commits, and the second then meets the first's lesson in the constraint and says
-- SLOT_TAKEN or LEARNER_BUSY, as create_booking already does. Only changes that can make an
-- overlap take the lock: a payment status changing does not.

create or replace function private.serialise_diary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('diary:' || new.instructor_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('learner:' || new.learner_id::text, 0));
  return new;
end;
$$;

revoke all on function private.serialise_diary() from public, anon, authenticated;

create trigger bookings_serialise_diary
  before insert or update of starts_at, ends_at, buffer_minutes, instructor_id, learner_id, status
  on public.bookings
  for each row execute function private.serialise_diary();
