-- A new lesson starts where that learner's lessons start (COV-04, BOK-05, D-215).
--
-- A learner's pickup points carry one marked "Lessons start here", and a booking made without one
-- named ended up with no pickup at all: the instructor's card said "No pickup point on this
-- lesson" for a learner whose front door is on file, and somebody had to set it by hand on every
-- lesson. The instructor's own booking screen worked around it in TypeScript; the learner booking
-- themselves from a public page got nothing, and neither did a recurring lesson, a cover lesson,
-- or a row put in by a seed.
--
-- One trigger rather than a copy of the rule in each of those, which is how D-208 went. It fills
-- the column in only when nothing was chosen, so taking a pickup point off a lesson afterwards
-- with `set_booking_pickup` still leaves it off: that is an update, and this is insert only.
--
-- It runs as its owner for the same reason `pickup_points_single_default` does (D-172): the
-- person booking is not always somebody who may read that learner's addresses under RLS, and a
-- rule that silently does nothing half the time is worse than no rule. It can only ever reach the
-- pickup points of the learner the booking is for, so no lesson can be sent to a stranger's door.

create or replace function private.bookings_default_pickup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pickup_point_id is null then
    select p.id into new.pickup_point_id
      from public.pickup_points p
     where p.learner_id = new.learner_id
       and p.is_default;
  end if;
  return new;
end;
$$;

comment on function private.bookings_default_pickup() is
  'Fills a new booking with the learner pickup point marked "Lessons start here", when the booking names none (COV-04, D-215).';

create trigger bookings_default_pickup
  before insert on public.bookings
  for each row when (new.pickup_point_id is null) execute function private.bookings_default_pickup();
