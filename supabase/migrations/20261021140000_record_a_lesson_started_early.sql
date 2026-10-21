-- A record for a lesson started early (PRG-01, D-178, D-316).
--
-- A lesson's card offers to start it a quarter of an hour before it is due, but its record was
-- refused until the minute it was due, as TOO_CLOSE, which reads "Too close to another lesson."
-- An instructor who started on time by the card and finished early was told something untrue and
-- could not save the record. The record is now taken from the same quarter of an hour before the
-- start, and a lesson further off is refused as LESSON_NOT_STARTED, which says so.
--
-- The function is otherwise as 20260915100000_lesson_records made it.

create or replace function public.save_lesson_record(
  p_id uuid,
  p_booking_id uuid,
  p_ratings jsonb,
  p_summary text,
  p_next_focus text default null,
  p_homework text default null,
  p_seconds_taken integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing public.lesson_records;
  v_booking public.bookings;
  v_summary text := nullif(btrim(coalesce(p_summary, '')), '');
  v_next_focus text := nullif(btrim(coalesce(p_next_focus, '')), '');
  v_homework text := nullif(btrim(coalesce(p_homework, '')), '');
  v_rating jsonb;
  v_codes text[] := array[]::text[];
  v_completed boolean := false;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_id is null or p_booking_id is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "id"}';
  end if;

  -- The lesson first, so two saves for one lesson take turns.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null
     or not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id) then
    -- Somebody who may not write this record is not told whether the lesson exists.
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  select * into v_existing from public.lesson_records where id = p_id;
  if v_existing.id is not null then
    if v_existing.booking_id <> p_booking_id then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "id"}';
    end if;
    -- Sent again: already saved, and nothing about it changes.
    return jsonb_build_object('id', v_existing.id, 'saved', false, 'completed', false);
  end if;

  if exists (select 1 from public.lesson_records where booking_id = p_booking_id) then
    raise exception 'ALREADY_RECORDED' using errcode = 'P0001';
  end if;

  if v_booking.status not in ('confirmed', 'in_progress', 'completed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  -- A lesson that has not started cannot have been taught. Its card offers to start it a quarter
  -- of an hour early (D-178), so one started then and ended early has its record too (D-316).
  if v_booking.starts_at > now() + interval '15 minutes' then
    raise exception 'LESSON_NOT_STARTED' using errcode = 'P0001';
  end if;

  if v_summary is null or char_length(v_summary) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "summary"}';
  end if;
  if char_length(coalesce(v_next_focus, '')) > 300 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "next_focus"}';
  end if;
  if char_length(coalesce(v_homework, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "homework"}';
  end if;
  if p_seconds_taken is not null and (p_seconds_taken < 0 or p_seconds_taken > 86400) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "seconds_taken"}';
  end if;

  -- At least one skill, each a real one, rated once, from 1 to 5.
  if jsonb_typeof(p_ratings) is distinct from 'array' or jsonb_array_length(p_ratings) = 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "ratings"}';
  end if;
  for v_rating in select value from jsonb_array_elements(p_ratings)
  loop
    if jsonb_typeof(v_rating) is distinct from 'object'
       or jsonb_typeof(v_rating -> 'rating') is distinct from 'number'
       or (v_rating ->> 'rating')::numeric not in (1, 2, 3, 4, 5)
       or not exists (select 1 from public.skills where code = v_rating ->> 'skill_code')
       or (v_rating ->> 'skill_code') = any (v_codes) then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "ratings"}';
    end if;
    v_codes := v_codes || (v_rating ->> 'skill_code');
  end loop;

  -- Taught and not yet marked done: saving the record marks it, as complete_booking would.
  if v_booking.status in ('confirmed', 'in_progress') then
    update public.bookings
       set status = 'completed', version = version + 1
     where id = p_booking_id;
    perform private.write_audit('booking.completed', 'booking', p_booking_id, v_booking.business_id,
      jsonb_build_object('status', v_booking.status), jsonb_build_object('status', 'completed'));
    perform private.enqueue_event('booking.completed', jsonb_build_object('booking_id', p_booking_id));
    v_completed := true;
  end if;

  insert into public.lesson_records (id, business_id, booking_id, learner_id, instructor_id, lesson_starts_at,
                                     summary, next_focus, homework, seconds_taken)
  values (p_id, v_booking.business_id, p_booking_id, v_booking.learner_id, v_booking.instructor_id, v_booking.starts_at,
          v_summary, v_next_focus, v_homework, p_seconds_taken);

  insert into public.skill_ratings (lesson_record_id, skill_code, rating, business_id, learner_id)
  select p_id, value ->> 'skill_code', (value ->> 'rating')::smallint, v_booking.business_id, v_booking.learner_id
    from jsonb_array_elements(p_ratings);

  perform private.write_audit('lesson_record.saved', 'lesson_record', p_id, v_booking.business_id, null,
    jsonb_build_object('booking_id', p_booking_id, 'skills', jsonb_array_length(p_ratings), 'seconds_taken', p_seconds_taken));
  perform private.enqueue_event('lesson_record.added',
    jsonb_build_object('lesson_record_id', p_id, 'booking_id', p_booking_id));

  return jsonb_build_object('id', p_id, 'saved', true, 'completed', v_completed);
end;
$$;

revoke all on function public.save_lesson_record(uuid, uuid, jsonb, text, text, text, integer) from public, anon;
grant execute on function public.save_lesson_record(uuid, uuid, jsonb, text, text, text, integer) to authenticated;
