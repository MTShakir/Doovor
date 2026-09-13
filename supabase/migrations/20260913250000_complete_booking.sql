-- After the lesson: taught, or nobody there (BOK-10, R-09, M2-25).

create or replace function public.complete_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_booking.status not in ('confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  -- A lesson that has not started cannot have been taught.
  if v_booking.starts_at > now() then
    raise exception 'TOO_CLOSE' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'completed', version = version + 1
   where id = p_booking_id;

  perform private.write_audit('booking.completed', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status), jsonb_build_object('status', 'completed'));
  perform private.enqueue_event('booking.completed', jsonb_build_object('booking_id', p_booking_id));

  return p_booking_id;
end;
$$;

/**
 * Nobody turned up (R-09). Not for a quarter of an hour after the start, because a learner
 * stuck in traffic is not a no-show, and it counts as a late cancellation by them.
 */
create or replace function public.mark_no_show(p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_rules jsonb;
  v_percent integer;
  v_fee integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_booking.status not in ('confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if now() < v_booking.starts_at + interval '15 minutes' then
    raise exception 'TOO_CLOSE' using errcode = 'P0001';
  end if;

  v_rules := private.booking_rules(v_booking.instructor_id);
  v_percent := coalesce((v_rules ->> 'late_fee_percent')::int, 100);
  v_fee := round(v_booking.price_pence * greatest(least(v_percent, 100), 0) / 100.0);

  update public.bookings
     set status = 'no_show',
         late_cancellation = true,
         fee_pence = v_fee,
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit('booking.no_show', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', 'no_show', 'fee_pence', v_fee));
  perform private.enqueue_event('booking.no_show',
    jsonb_build_object('booking_id', p_booking_id, 'fee_pence', v_fee));

  return jsonb_build_object('fee_pence', v_fee);
end;
$$;

revoke all on function public.complete_booking(uuid) from public, anon;
revoke all on function public.mark_no_show(uuid, text) from public, anon;
grant execute on function public.complete_booking(uuid) to authenticated;
grant execute on function public.mark_no_show(uuid, text) to authenticated;
