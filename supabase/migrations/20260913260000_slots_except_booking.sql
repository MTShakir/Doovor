-- The times either side of a lesson being moved (BOK-08, M2-26).
--
-- A lesson is not in its own way: somebody moving the ten o'clock by half an hour was being
-- told half past ten was taken, by the very lesson they were moving. private.slot_problem
-- already knows how to leave one booking out of the diary; the list of times now asks it to.

drop function if exists public.open_slots(uuid, date, integer);

create or replace function public.open_slots(
  p_instructor_id uuid,
  p_date date,
  p_duration_minutes integer,
  p_except_booking_id uuid default null
)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select candidate
    from generate_series(
           (p_date + time '00:00') at time zone 'Europe/London',
           (p_date + time '23:30') at time zone 'Europe/London',
           interval '30 minutes'
         ) as candidate
   where exists (
           select 1 from public.instructor_profiles i
            where i.id = p_instructor_id
              and i.verification_status = 'approved'
              and (i.badge_expiry is null or i.badge_expiry >= current_date)
         )
     and private.slot_problem(p_instructor_id, candidate, p_duration_minutes, 'learner', null, now(),
                              p_except_booking_id) is null;
$$;

revoke all on function public.open_slots(uuid, date, integer, uuid) from public;
grant execute on function public.open_slots(uuid, date, integer, uuid) to anon, authenticated;
