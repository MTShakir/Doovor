-- Requests an instructor answers, and the ones nobody answered (BOK-06, R-12, M2-18).

create or replace function public.decide_booking_request(
  p_booking_id uuid,
  p_accept boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_status public.booking_status;
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
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
     and not private.auth_has_permission(v_booking.business_id, 'manage_bookings') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- A request that has already been answered, or has run out of time, is not one to answer.
  if v_booking.status <> 'requested' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.expires_at is not null and v_booking.expires_at <= now() then
    update public.bookings set status = 'expired' where id = p_booking_id;
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "expires_at"}';
  end if;

  v_status := case when p_accept then 'confirmed' else 'cancelled' end::public.booking_status;

  update public.bookings
     set status = v_status,
         expires_at = null,
         cancelled_at = case when p_accept then null else now() end,
         cancelled_by = case when p_accept then null else v_user end,
         cancel_reason = case when p_accept then null else nullif(btrim(coalesce(p_reason, '')), '') end,
         version = version + 1
   where id = p_booking_id;

  perform private.write_audit(
    case when p_accept then 'booking.accepted' else 'booking.declined' end,
    'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('status', v_booking.status),
    jsonb_build_object('status', v_status, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );
  perform private.enqueue_event(
    case when p_accept then 'booking.accepted' else 'booking.declined' end,
    jsonb_build_object('booking_id', p_booking_id)
  );

  return v_status::text;
end;
$$;

/**
 * Requests nobody answered in time (R-12). Run by the sweep every few minutes, so a slot
 * that is no longer really held stops looking held.
 */
create or replace function public.system_expire_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with lapsed as (
    update public.bookings
       set status = 'expired', version = version + 1
     where status = 'requested'
       and expires_at is not null
       and expires_at <= now()
    returning id, business_id
  )
  select count(*)::int into v_count from lapsed;

  return v_count;
end;
$$;

revoke all on function public.decide_booking_request(uuid, boolean, text) from public, anon;
revoke all on function public.system_expire_requests() from public, anon, authenticated;
grant execute on function public.decide_booking_request(uuid, boolean, text) to authenticated;
grant execute on function public.system_expire_requests() to service_role;
