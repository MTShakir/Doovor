-- Where a lesson starts from, set after it was booked (COV-04, BOK-05, D-185).
--
-- The product owner asked a learner to be able to open a lesson they have booked and say where
-- they are collected, rather than waiting for their instructor to ask. A booking's pickup point
-- could only ever be chosen while the lesson was being booked, and `bookings` has no update grant
-- at all, so this is the RPC that changes it: one transaction, the actor from `auth.uid()`, and an
-- audit row, as every other write to a booking is.
--
-- Who may: the learner whose lesson it is, the instructor teaching it, and anybody who manages the
-- Business's bookings. The point has to be one of that learner's own, so a lesson can never be
-- sent to somebody else's front door, and the lesson has to be one that is still going to happen.

create or replace function public.set_booking_pickup(p_booking_id uuid, p_pickup_point_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_was uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if not (
    v_booking.learner_id = v_user
    or exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
    or private.auth_has_permission(v_booking.business_id, 'manage_bookings')
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- A lesson that has been taught, or called off, is not one to be collected for.
  if v_booking.status not in ('requested', 'pending_payment', 'confirmed') or v_booking.ends_at <= now() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  if p_pickup_point_id is not null and not exists (
    select 1 from public.pickup_points p where p.id = p_pickup_point_id and p.learner_id = v_booking.learner_id
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "pickupPointId"}';
  end if;

  v_was := v_booking.pickup_point_id;
  if v_was is not distinct from p_pickup_point_id then
    return;
  end if;

  update public.bookings
     set pickup_point_id = p_pickup_point_id,
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit(
    'booking.pickup_set',
    'booking',
    p_booking_id,
    v_booking.business_id,
    jsonb_build_object('pickup_point_id', v_was),
    jsonb_build_object('pickup_point_id', p_pickup_point_id)
  );
end;
$$;

comment on function public.set_booking_pickup(uuid, uuid) is
  'Sets or clears where a lesson is collected from (COV-04, D-185). Written by the learner whose lesson it is, their instructor, or somebody who manages bookings for the Business, and only with a pickup point belonging to that learner.';

revoke all on function public.set_booking_pickup(uuid, uuid) from public, anon;
grant execute on function public.set_booking_pickup(uuid, uuid) to authenticated;
