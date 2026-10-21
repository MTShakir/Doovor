-- A booked lesson makes a learner active (LRN-05, D-315).
--
-- An invited learner starts as an enquiry, and nothing ever moved them on: a learner with lessons
-- booked and paid for still read "Enquiry, asked about lessons, nothing booked yet" on every list.
-- Once a lesson with them is confirmed, an enquiry or somebody waiting is active. A trigger rather
-- than a line in each way a lesson is confirmed (booked by the instructor, booked on the link,
-- paid for, a request accepted, a run of lessons), for the reason the Free limit is one (D-208):
-- the next way in would have missed it.
--
-- An enquiry coming onto the books is what the Free limit counts. With no room left the learner
-- stays an enquiry and the lesson stands: a lesson, or a payment for one, is never refused over
-- a count. Somebody who has passed or left is not moved back; the instructor says so if they are.

create function private.booked_learner_is_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booked constant public.booking_status[] := array['confirmed', 'in_progress', 'completed'];
  v_relationship public.learner_relationships;
begin
  if not (new.status = any (v_booked)) or (tg_op = 'UPDATE' and old.status = any (v_booked)) then
    return null;
  end if;

  select * into v_relationship
    from public.learner_relationships r
   where r.business_id = new.business_id
     and r.learner_id = new.learner_id
     and r.status in ('enquiry', 'waiting')
     for update;
  if not found then
    return null;
  end if;
  if v_relationship.status = 'enquiry' and not private.learner_room(new.business_id) then
    return null;
  end if;

  update public.learner_relationships set status = 'active' where id = v_relationship.id;

  perform private.write_audit(
    'learner.status_changed', 'learner_relationship', v_relationship.id, v_relationship.business_id,
    jsonb_build_object('status', v_relationship.status),
    jsonb_build_object('status', 'active', 'because', 'booked')
  );
  return null;
end;
$$;

revoke all on function private.booked_learner_is_active() from public, anon, authenticated;

create trigger bookings_make_learner_active
  after insert or update of status on public.bookings
  for each row execute function private.booked_learner_is_active();

-- Everybody already booked and still shown as an enquiry or waiting, oldest first, one at a time
-- so each sees the room the one before it took.
do $$
declare
  v_row record;
begin
  for v_row in
    select r.id, r.business_id, r.status
      from public.learner_relationships r
     where r.status in ('enquiry', 'waiting')
       and exists (
         select 1 from public.bookings b
          where b.business_id = r.business_id
            and b.learner_id = r.learner_id
            and b.status in ('confirmed', 'in_progress', 'completed')
       )
     order by r.created_at, r.id
  loop
    if v_row.status = 'waiting' or private.learner_room(v_row.business_id) then
      update public.learner_relationships set status = 'active' where id = v_row.id;
      perform private.write_audit(
        'learner.status_changed', 'learner_relationship', v_row.id, v_row.business_id,
        jsonb_build_object('status', v_row.status),
        jsonb_build_object('status', 'active', 'because', 'booked')
      );
    end if;
  end loop;
end;
$$;
