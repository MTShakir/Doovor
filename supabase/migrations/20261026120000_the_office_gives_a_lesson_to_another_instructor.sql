-- The school's office gives a lesson to another of its instructors (SCH-02, LRN-06, D-120, D-397).
--
-- D-120 kept the lessons of an instructor who is switched off in the school's diary "for the school
-- to give to another instructor or call off", and the box that switches somebody off says the same,
-- but nothing could give one: the office could only call a lesson off or move it in the same
-- instructor's diary, where a switched-off instructor is booked for nothing. A school covering for
-- somebody ill or on holiday, or giving a learner to a new instructor along with the lessons they
-- have booked, had to cancel each lesson, tell the learner, and book it again.
--
-- `give_lesson_to` hands one lesson still to come to another instructor at the same school, at the
-- same time and price, if they are free then. Only somebody who manages the school's bookings may,
-- the instructor's own hours do not bind the office (R-04), and a trainee nobody supervises is
-- refused by the trigger that guards every lesson (D-061). The learner, both instructors and the
-- office are told; `system_instructor_named` names the instructor it was with for the job that
-- tells them. `lesson_cover_choices` lists who could take it, free first.

create function public.give_lesson_to(p_booking_id uuid, p_instructor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_was public.instructor_profiles;
  v_now public.instructor_profiles;
  v_minutes integer;
  v_problem text;
  v_constraint text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- Who teaches whom is the school's to decide (D-278), so only its office gives a lesson away.
  if not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = v_booking.business_id and b.type = 'school') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- A lesson that is on and still to come: one under way, over, called off, or waiting on an
  -- answer or a payment is not handed to somebody else.
  if v_booking.status <> 'confirmed' or v_booking.starts_at <= now() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  select * into v_now from public.instructor_profiles where id = p_instructor_id;
  if v_now.id is null or v_now.business_id <> v_booking.business_id then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if p_instructor_id = v_booking.instructor_id then
    return p_booking_id;
  end if;
  select * into v_was from public.instructor_profiles where id = v_booking.instructor_id;

  v_minutes := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int;
  v_problem := private.slot_problem(p_instructor_id, v_booking.starts_at, v_minutes, 'instructor', v_booking.learner_id, now(), p_booking_id);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  begin
    update public.bookings
       set instructor_id = p_instructor_id,
           -- The travel time after it is the new instructor's own (D-187).
           buffer_minutes = coalesce((private.booking_rules(p_instructor_id) ->> 'buffer_minutes')::int, 30),
           version = version + 1
     where id = p_booking_id;
  exception
    when exclusion_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bookings_learner_no_overlap' then
        raise exception 'LEARNER_BUSY' using errcode = '23P01';
      end if;
      raise exception 'SLOT_TAKEN' using errcode = '23P01';
  end;

  -- The names as they were on the day, so the record still reads true after a rename.
  perform private.write_audit('booking.reassigned', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('instructor_profile_id', v_was.id, 'instructor_name', v_was.display_name),
    jsonb_build_object('instructor_profile_id', v_now.id, 'instructor_name', v_now.display_name));
  -- Identifiers only: events leave the United Kingdom (ARCHITECTURE 9).
  perform private.enqueue_event('booking.reassigned', jsonb_build_object('booking_id', p_booking_id, 'was_instructor_id', v_was.id));

  return p_booking_id;
end;
$$;

/**
 * Who at the school could take a lesson: everybody teaching there who is switched on, but the
 * instructor it is with, and why each one cannot where they cannot. Free first, then by name.
 */
create function public.lesson_cover_choices(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_minutes integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null or not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  v_minutes := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'instructor_id', c.id,
             'name', c.display_name,
             'transmission', c.transmission,
             'problem', c.problem
           ) order by c.problem is not null, c.display_name)
      from (
        select i.id, i.display_name, i.transmission::text as transmission,
               case
                 when not private.is_supervised(i.id) then 'PDI_NOT_LINKED'
                 else private.slot_problem(i.id, v_booking.starts_at, v_minutes, 'instructor', v_booking.learner_id, now(), p_booking_id)
               end as problem
          from public.instructor_profiles i
          join public.memberships m on m.business_id = i.business_id and m.user_id = i.user_id and m.status = 'active'
         where i.business_id = v_booking.business_id
           and i.id <> v_booking.instructor_id
      ) as c
  ), '[]'::jsonb);
end;
$$;

/** Who an instructor is, to tell them a lesson of theirs went to somebody else (D-397). */
create function public.system_instructor_named(p_instructor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('user_id', i.user_id, 'name', i.display_name)
    from public.instructor_profiles i
   where i.id = p_instructor_id;
$$;

revoke all on function public.system_instructor_named(uuid) from public, anon, authenticated;
grant execute on function public.system_instructor_named(uuid) to service_role;
revoke all on function public.give_lesson_to(uuid, uuid) from public, anon;
revoke all on function public.lesson_cover_choices(uuid) from public, anon;
grant execute on function public.give_lesson_to(uuid, uuid) to authenticated;
grant execute on function public.lesson_cover_choices(uuid) to authenticated;
