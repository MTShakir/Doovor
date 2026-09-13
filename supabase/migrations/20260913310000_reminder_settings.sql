-- How long before a lesson a Business reminds learners (NTF-02, M2-30).
--
-- It belongs with the other settings a Business owns, so it goes through the same function
-- and the same permission check. Missing means the platform default, which is why it is not
-- required: a client that has not been updated still saves the rest.

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
  v_reminders jsonb := p_rules -> 'reminder_hours_before';
  v_hours int;
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

  if v_reminders is not null then
    if jsonb_typeof(v_reminders) <> 'array' or jsonb_array_length(v_reminders) not between 1 and 4 then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "reminderHoursBefore"}';
    end if;
    for v_hours in select value::int from jsonb_array_elements_text(v_reminders) as value loop
      if v_hours is null or v_hours not between 1 and 168 then
        raise exception 'VALIDATION_FAILED' using detail = '{"field": "reminderHoursBefore"}';
      end if;
    end loop;
  end if;

  v_after := jsonb_build_object(
    'notice_hours', v_notice,
    'horizon_weeks', v_horizon,
    'cancellation_window_hours', v_window,
    'late_fee_percent', v_fee,
    'request_expiry_hours', v_expiry
  ) || case when v_reminders is null then '{}'::jsonb else jsonb_build_object('reminder_hours_before', v_reminders) end;

  select settings into v_before from public.businesses where id = p_business_id;
  -- Merged, not replaced: settings holds more than booking rules.
  update public.businesses set settings = coalesce(settings, '{}'::jsonb) || v_after where id = p_business_id;

  perform private.write_audit(
    'business.booking_rules_changed', 'business', p_business_id, p_business_id, v_before, v_after
  );
  return v_after;
end;
$$;
