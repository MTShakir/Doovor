-- A learner is told when their request runs out with nobody answering it (BOK-06, R-12, NTF-03, D-377).
--
-- A request nobody answered in time lapses (R-12), and nobody was told: the learner's lesson
-- turned to Expired on their list and nowhere else, so they could still be expecting it, and a
-- hold on their card waited for the next quarter-hour sweep. Found in the A to Z round on
-- 22 Oct 2026. However a request lapses (the sweep, an answer that came too late, or a booking
-- tidying the diary), it now raises the event a turned-down request raises, marked as having run
-- out: the learner is told it was not booked, and the hold on their card is let go at once.

create or replace function private.tell_of_lapsed_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_event('booking.declined', jsonb_build_object('booking_id', new.id, 'lapsed', true));
  return null;
end;
$$;

revoke all on function private.tell_of_lapsed_request() from public, anon, authenticated;

create trigger bookings_tell_of_lapsed_request
  after update of status on public.bookings
  for each row
  when (old.status = 'requested' and new.status = 'expired')
  execute function private.tell_of_lapsed_request();
