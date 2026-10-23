-- A change to a lesson names who made it, so they are not emailed about it (NTF-03, NTF-04, D-384).
--
-- The product owner decided that somebody who books, moves or calls off a lesson themselves, or
-- marks it as a no-show, hears about it in the app only: an email and a push about what they have
-- just done tell them nothing, and an instructor booking a week of lessons got one of each for
-- every one. The job that writes the notices reads the people a lesson concerns, but not which of
-- them made the change, so every lesson event raised in somebody's request now carries their user
-- id as `actor`. It is an identifier, as the rest of a payload is (ARCHITECTURE 9). A job, a
-- webhook and the sweeps are nobody, and leave it out.
--
-- Only lesson events carry it. Other events say exactly what they need and nothing about who
-- (a learner joining from an invitation names the invitation, a school's notice its kind and id),
-- and their tests hold them to it.

create or replace function private.enqueue_event(p_name text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor uuid := (select auth.uid());
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  -- Whatever the caller already put in the payload stands: `actor` is only ever added.
  if v_actor is not null and p_name like 'booking.%' and not (v_payload ? 'actor') then
    v_payload := v_payload || jsonb_build_object('actor', v_actor);
  end if;

  insert into public.outbox_events (name, payload) values (p_name, v_payload)
  returning id into v_id;
  return v_id;
end;
$$;
