-- Calling a lesson off (BOK-09, R-06 to R-09, M2-22).
--
-- The decision is the same one packages/core/src/cancellation.ts makes for the screen that
-- warns somebody first: who cancelled, how long before, and what the Business charges. The
-- money itself moves in M3; what is recorded here is what was decided and why.

create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_rules jsonb;
  v_window integer;
  v_percent integer;
  v_by text;
  v_late boolean;
  v_fee integer := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id) then
    v_by := 'instructor';
  elsif private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    v_by := 'business';
  elsif v_booking.learner_id = v_user then
    v_by := 'learner';
  else
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_booking.status not in ('requested', 'pending_payment', 'confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  -- An instructor calling a lesson off has to say why: the learner is told (R-08).
  if v_by in ('instructor', 'business') and v_reason is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  v_rules := private.booking_rules(v_booking.instructor_id);
  v_window := coalesce((v_rules ->> 'cancellation_window_hours')::int, 48);
  v_percent := coalesce((v_rules ->> 'late_fee_percent')::int, 100);
  v_late := v_booking.starts_at - now() < make_interval(hours => v_window);

  -- Nothing is charged when the instructor or the Business is the one calling it off (R-08).
  if v_late and v_by = 'learner' then
    v_fee := round(v_booking.price_pence * greatest(least(v_percent, 100), 0) / 100.0);
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_user,
         cancel_reason = v_reason,
         late_cancellation = v_late,
         fee_pence = v_fee,
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit('booking.cancelled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', 'cancelled', 'by', v_by, 'late', v_late, 'fee_pence', v_fee, 'reason', v_reason));
  perform private.enqueue_event('booking.cancelled',
    jsonb_build_object('booking_id', p_booking_id, 'by', v_by, 'late', v_late, 'fee_pence', v_fee));

  return jsonb_build_object('late', v_late, 'fee_pence', v_fee, 'by', v_by);
end;
$$;

revoke all on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
