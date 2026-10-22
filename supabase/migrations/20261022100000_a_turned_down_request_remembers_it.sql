-- A request the instructor turned down remembers it (BOK-06, R-12, D-336, D-340).
--
-- Turning a request down has always written it off as cancelled, so every rule about lessons that
-- are off, their fees, refunds and holds treats it as one, and that does not change. What changes
-- is that the booking remembers it was turned down, so its pill can say "Declined": nobody
-- cancelled a lesson that was never booked.

alter table public.bookings add column declined_at timestamptz;

comment on column public.bookings.declined_at is
  'When the instructor or the office turned the request down. Its status stays cancelled (D-340).';

-- Requests turned down already, from the audit trail.
update public.bookings b
   set declined_at = a.occurred_at
  from public.audit_log a
 where a.action = 'booking.declined'
   and a.entity_id = b.id
   and b.status = 'cancelled'
   and b.declined_at is null;

-- Decide as before, and say when it was turned down.
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
         declined_at = case when p_accept then null else now() end,
         version = version + 1
   where id = p_booking_id;

  -- A declined request keeps nothing: the credit it was paid with all comes back (R-12).
  if not p_accept and v_booking.payment_status = 'paid_credit'
     and (private.give_back_credit(p_booking_id, 0, v_user) ->> 'returned')::integer > 0 then
    update public.bookings set payment_status = 'refunded' where id = p_booking_id;
  end if;

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
