-- Lesson records and the ratings in them (PRG-01, PRG-03, PRG-09, M4-02, M4-03).
--
-- After a lesson the instructor taps the skills they covered, rates each from 1 to 5, and writes a
-- line about it. The record belongs to the learner, who reads it with every Business they learn
-- with (ARCHITECTURE 5.2). Its id is made on the device, so a record saved with no signal and sent
-- again when the signal comes back is the same record however often it arrives (ARCHITECTURE 11).
-- One record for each lesson. Writes go through save_lesson_record only.

-- Who a record is for. The learner and the Business, or the Business alone. Every record saved in
-- Phase 1 is for the learner; the second value is what the Driving Passport's sharing rules
-- (PRG-04) build on (D-100).
create type public.lesson_record_visibility as enum ('learner', 'business');

create table public.lesson_records (
  -- Made on the device, not here.
  id uuid primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- A lesson with a record is kept: the record is the learner's.
  booking_id uuid not null unique references public.bookings (id) on delete restrict,
  learner_id uuid not null references public.users (id) on delete cascade,
  -- Whoever taught the lesson, which is who writes its record.
  instructor_id uuid not null references public.instructor_profiles (id),
  -- When the lesson started, kept with its record: a timeline and a skill map go by when lessons
  -- happened, not by when a phone found signal to send them, and not every reader of a record can
  -- read the booking behind it.
  lesson_starts_at timestamptz not null,
  summary text not null check (char_length(btrim(summary)) between 1 and 500),
  next_focus text check (next_focus is null or char_length(next_focus) <= 300),
  homework text check (homework is null or char_length(homework) <= 500),
  visibility public.lesson_record_visibility not null default 'learner',
  -- How long the form took, for the 60 seconds PRG-01 promises.
  seconds_taken integer check (seconds_taken is null or seconds_taken between 0 and 86400),
  created_at timestamptz not null default now()
);

comment on table public.lesson_records is
  'A lesson record (PRG-01). Its id is made on the device, so saving it again is saving the same record. Written by save_lesson_record only.';

-- A learner's timeline, newest lesson first, a page at a time (PRG-03).
create index lesson_records_learner_idx on public.lesson_records (learner_id, lesson_starts_at desc, id desc);
create index lesson_records_business_idx on public.lesson_records (business_id, lesson_starts_at desc);
create index lesson_records_instructor_idx on public.lesson_records (instructor_id);

create table public.skill_ratings (
  lesson_record_id uuid not null references public.lesson_records (id) on delete cascade,
  skill_code text not null references public.skills (code),
  rating smallint not null check (rating between 1 and 5),
  -- The record's, kept here so a skill map is one query over one table.
  business_id uuid not null references public.businesses (id) on delete cascade,
  learner_id uuid not null references public.users (id) on delete cascade,
  primary key (lesson_record_id, skill_code)
);

comment on table public.skill_ratings is
  'One rating for one skill area in one lesson record (PRG-01, PRG-02). Written by save_lesson_record only.';

create index skill_ratings_learner_idx on public.skill_ratings (learner_id, skill_code);

-- ---------------------------------------------------------------------------------------
-- Who reads them (PRD 6.2: "View learner progress"). Nobody writes them directly.
-- ---------------------------------------------------------------------------------------

alter table public.lesson_records enable row level security;
alter table public.skill_ratings enable row level security;

grant select on public.lesson_records to authenticated;
grant select on public.skill_ratings to authenticated;

-- The learner, with every Business they learn with, for the records meant for them.
create policy lesson_records_select_learner on public.lesson_records
  for select to authenticated
  using (learner_id = (select auth.uid()) and visibility = 'learner');

-- The owners and managers of the Business the record was written in.
create policy lesson_records_select_business_admins on public.lesson_records
  for select to authenticated
  using (business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[])));

-- An instructor: the records they wrote, and every record for a learner assigned to them there.
create policy lesson_records_select_instructor on public.lesson_records
  for select to authenticated
  using (
    instructor_id in (select private.auth_instructor_ids())
    or exists (
      select 1
        from public.learner_relationships lr
       where lr.business_id = lesson_records.business_id
         and lr.learner_id = lesson_records.learner_id
         and lr.instructor_id in (select private.auth_instructor_ids())
    )
  );

create policy lesson_records_select_staff on public.lesson_records
  for select to authenticated
  using ((select private.auth_is_staff()));

-- A rating is read by whoever can read its record.
create policy skill_ratings_select_with_record on public.skill_ratings
  for select to authenticated
  using (exists (select 1 from public.lesson_records r where r.id = skill_ratings.lesson_record_id));

-- ---------------------------------------------------------------------------------------
-- Saving one.
-- ---------------------------------------------------------------------------------------

/**
 * Saves the record for a lesson (PRG-01, PRG-09). Returns `{ id, saved, completed }`.
 *
 * The same id again is the same record: nothing changes and `saved` is false, which is how a
 * record sent from a phone with no signal can be sent as often as it takes. A different id for a
 * lesson that already has a record is another device's record, and is refused as ALREADY_RECORDED.
 *
 * Only the instructor who taught the lesson writes its record (PRD 6.2). A lesson that has started
 * and is not yet marked done is marked done by saving its record: with no signal, both happen on
 * the phone and arrive here together. Ratings are `[{ "skill_code": "JUNCTIONS", "rating": 3 }]`.
 */
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
  -- A lesson that has not started cannot have been taught.
  if v_booking.starts_at > now() then
    raise exception 'TOO_CLOSE' using errcode = 'P0001';
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
