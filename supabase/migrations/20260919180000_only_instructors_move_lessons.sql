-- Only an instructor moves a lesson (BOK-08 as the product owner amended it, D-164).
--
-- A learner could move their own lesson outside the cancellation window. The product owner wants
-- every move to go through the instructor, so a learner now asks them instead, and the app says so.
-- The instructor, and anybody who manages the Business's bookings, still moves a lesson at any
-- time, with the learner told. Nothing else about moving a lesson changes.

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_by text;
  v_minutes integer;
  v_was integer;
  v_problem text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- Only the instructor, or somebody who manages the Business's bookings, moves a lesson. A
  -- learner asks them (BOK-08 as amended, D-164).
  if not (
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
    or private.auth_has_permission(v_booking.business_id, 'manage_bookings')
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  v_by := 'instructor';

  if v_booking.status not in ('requested', 'pending_payment', 'confirmed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  v_was := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int;
  v_minutes := coalesce(p_duration_minutes, v_was);

  v_problem := private.slot_problem(
    v_booking.instructor_id, p_starts_at, v_minutes, v_by, v_booking.learner_id, now(), p_booking_id
  );
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  update public.bookings
     set starts_at = p_starts_at,
         ends_at = p_starts_at + make_interval(mins => v_minutes),
         version = version + 1
   where id = p_booking_id;

  -- A lesson paid with credit that is now a different length gives its credit back and pays
  -- for the new length the way a new booking would: from credit if there is enough, and
  -- otherwise on the Business's terms (PAY-04).
  if v_booking.payment_status = 'paid_credit' and v_minutes <> v_was then
    perform private.give_back_credit(p_booking_id, 0, v_user);
    update public.bookings
       set payment_status = 'unpaid',
           payment_mode = private.new_booking_payment_mode(v_booking.business_id),
           credit_minutes = 0
     where id = p_booking_id;
    perform private.pay_with_credit(p_booking_id, v_user);
  end if;

  perform private.write_audit('booking.rescheduled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('starts_at', v_booking.starts_at),
    jsonb_build_object('starts_at', p_starts_at, 'by', v_by));
  perform private.enqueue_event('booking.rescheduled',
    jsonb_build_object('booking_id', p_booking_id, 'was', v_booking.starts_at, 'now', p_starts_at));

  return p_booking_id;
end;
$$;

revoke all on function public.reschedule_booking(uuid, timestamptz, integer) from public, anon;
grant execute on function public.reschedule_booking(uuid, timestamptz, integer) to authenticated;
