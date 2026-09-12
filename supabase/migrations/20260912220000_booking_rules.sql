-- Booking rules a Business can change (PRD 11.1, DIA-05, DIA-06, BOK-06, M1-18).
--
-- The ranges are in the product, so they are checked here as well as in TypeScript: this
-- function is reachable from the API, and a value outside the range would quietly change what
-- learners can book. Only the settings a Business owns go through here; the buffer and
-- instant booking belong to the instructor and are columns on their profile.

create or replace function public.set_booking_rules(p_business_id uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notice int := (p_rules ->> 'notice_hours')::int;
  v_horizon int := (p_rules ->> 'horizon_weeks')::int;
  v_window int := (p_rules ->> 'cancellation_window_hours')::int;
  v_fee int := (p_rules ->> 'late_fee_percent')::int;
  v_expiry int := (p_rules ->> 'request_expiry_hours')::int;
  v_before jsonb;
  v_after jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_profile') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if v_notice is null or v_notice not between 0 and 72 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "noticeHours"}';
  end if;
  if v_horizon is null or v_horizon not between 1 and 26 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "horizonWeeks"}';
  end if;
  if v_window is null or v_window not between 0 and 72 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "cancellationWindowHours"}';
  end if;
  if v_fee is null or v_fee not in (0, 50, 100) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "lateFeePercent"}';
  end if;
  if v_expiry is null or v_expiry not between 1 and 48 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "requestExpiryHours"}';
  end if;

  v_after := jsonb_build_object(
    'notice_hours', v_notice,
    'horizon_weeks', v_horizon,
    'cancellation_window_hours', v_window,
    'late_fee_percent', v_fee,
    'request_expiry_hours', v_expiry
  );

  select settings into v_before from public.businesses where id = p_business_id;
  -- Merged, not replaced: settings holds more than booking rules.
  update public.businesses set settings = coalesce(settings, '{}'::jsonb) || v_after where id = p_business_id;

  perform private.write_audit(
    'business.booking_rules_changed', 'business', p_business_id, p_business_id, v_before, v_after
  );
  return v_after;
end;
$$;

revoke all on function public.set_booking_rules(uuid, jsonb) from public, anon;
grant execute on function public.set_booking_rules(uuid, jsonb) to authenticated;
