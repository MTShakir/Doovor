-- Two people booking at the same moment (BOK-07, R-02, M2-15).
--
-- create_booking tidies up lapsed requests before it looks at the slot. Two transactions
-- doing that at once could lock the same rows in different orders and deadlock, which is a
-- confusing way to lose a race: the answer should be that the slot has just gone.
--
-- This is the same function with that one statement made deterministic.

create or replace function public.create_booking(
  p_instructor_id uuid,
  p_learner_id uuid,
  p_lesson_type_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_pickup_point_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_is_instructor boolean;
  v_is_learner boolean := false;
  v_by text;
  v_rules jsonb;
  v_buffer integer;
  v_price integer;
  v_problem text;
  v_status public.booking_status;
  v_expires timestamptz;
  v_ends_at timestamptz := p_starts_at + make_interval(mins => p_duration_minutes);
  v_id uuid;
  v_constraint text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- Who is asking decides which rules apply (R-04) and how the booking starts life.
  v_is_instructor :=
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
    or private.auth_has_permission(v_business, 'manage_bookings');
  if not v_is_instructor then
    v_is_learner := p_learner_id = v_user;
    if not v_is_learner then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
    if not exists (select 1 from public.learner_profiles where user_id = v_user) then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;
  v_by := case when v_is_instructor then 'instructor' else 'learner' end;

  -- An instructor books for their own learners; a learner booking for the first time joins
  -- the Business as they do it (BOK-02, LRN-03).
  if v_is_instructor then
    if not exists (
      select 1 from public.learner_relationships
       where business_id = v_business and learner_id = p_learner_id
    ) then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  else
    insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, created_by)
    values (v_business, p_learner_id, p_instructor_id, 'active', 'marketplace', v_user)
    on conflict (business_id, learner_id) do nothing;
  end if;

  -- The price comes from the catalogue, never from the caller (R-05).
  select price_pence into v_price
    from public.lesson_prices
   where lesson_type_id = p_lesson_type_id
     and business_id = v_business
     and duration_minutes = p_duration_minutes
     and (instructor_id = p_instructor_id or instructor_id is null)
   order by instructor_id nulls last
   limit 1;
  if v_price is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
  end if;

  -- A request nobody answered stops holding the slot the moment it lapses (R-12). The rows
  -- are locked in one order and any already being expired elsewhere are left alone, so two
  -- people booking at the same moment cannot deadlock over the tidying up.
  update public.bookings
     set status = 'expired'
   where id in (
     select id from public.bookings
      where instructor_id = p_instructor_id
        and status = 'requested'
        and expires_at <= now()
      order by id
      for update skip locked
   );

  v_problem := private.slot_problem(p_instructor_id, p_starts_at, p_duration_minutes, v_by, p_learner_id, now());
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  v_rules := private.booking_rules(p_instructor_id);
  v_buffer := coalesce((v_rules ->> 'buffer_minutes')::int, 30);

  -- An instructor's own booking is confirmed. A learner's is confirmed too when the
  -- instructor takes bookings instantly, and otherwise waits for them (BOK-06, R-12).
  if v_is_instructor or coalesce((select instant_book from public.instructor_profiles where id = p_instructor_id), true) then
    v_status := 'confirmed';
  else
    v_status := 'requested';
    v_expires := least(
      now() + make_interval(hours => coalesce((v_rules ->> 'request_expiry_hours')::int, 12)),
      p_starts_at - interval '2 hours'
    );
  end if;

  begin
    insert into public.bookings (
      business_id, instructor_id, learner_id, lesson_type_id, pickup_point_id,
      starts_at, ends_at, buffer_minutes, status, price_pence, source, expires_at, created_by
    ) values (
      v_business, p_instructor_id, p_learner_id, p_lesson_type_id, p_pickup_point_id,
      p_starts_at, v_ends_at, v_buffer, v_status, v_price,
      case when v_is_instructor then 'instructor' else 'self' end::public.booking_source,
      v_expires, v_user
    )
    returning id into v_id;
  exception
    when exclusion_violation then
      -- Two people took the same slot at once. Which one lost says what to tell them (R-02, R-03).
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'bookings_learner_no_overlap' then
        raise exception 'LEARNER_BUSY' using errcode = '23P01';
      end if;
      raise exception 'SLOT_TAKEN' using errcode = '23P01';
  end;

  perform private.write_audit('booking.created', 'booking', v_id, v_business, null,
    jsonb_build_object(
      'instructor_profile_id', p_instructor_id,
      'learner_id', p_learner_id,
      'starts_at', p_starts_at,
      'duration_minutes', p_duration_minutes,
      'status', v_status,
      'price_pence', v_price,
      'by', v_by
    ));

  perform private.enqueue_event('booking.created', jsonb_build_object('booking_id', v_id, 'status', v_status));

  return v_id;
end;
$$;

revoke all on function public.create_booking(uuid, uuid, uuid, timestamptz, integer, uuid) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, timestamptz, integer, uuid) to authenticated;
