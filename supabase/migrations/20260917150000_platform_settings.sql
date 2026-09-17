-- Platform settings for super admins: default booking rules, the switch-on rule, plan limits, the
-- marketplace fee and feature flags (ADM-05, PRD 6.2, M5-20).
--
-- The settings live in `platform_settings`, one row a kind. Staff past their second step read them;
-- only a super admin changes one, through a function that checks every value against the ranges
-- the rest of the product enforces and writes the change to the audit log (D-128).

-- The default reminder times were kept under a name nothing read, so every reminder fell back to
-- the times in code; they now sit where a Business keeps its own, and the reminder job reads them.
update public.platform_settings
   set value = (value - 'reminder_hours')
               || jsonb_build_object('reminder_hours_before', coalesce(value -> 'reminder_hours_before', value -> 'reminder_hours', '[24, 2]'::jsonb))
 where key = 'booking_defaults';

insert into public.platform_settings (key, value, description) values
  ('plan_limits', '{"pro": {"sms_reminders_per_month": 200}, "school": {"sms_reminders_per_month": 200}}',
   'Text message reminders a Business on each plan may send a month (PRD 9.18, NTF-01)'),
  ('marketplace_fee', '{"percent": 5, "cap_pence": 200}',
   'Booking fee on a learner''s first marketplace booking with an instructor, charged from Phase 3 (PRD 9.18)'),
  ('feature_flags', '{"google_sign_in": true, "apple_sign_in": false, "marketplace": false}',
   'Features switched on or off for everybody (ADM-05)')
on conflict (key) do nothing;

-- Nobody signed in writes a setting straight into the table.
revoke insert, update, delete, truncate on public.platform_settings from authenticated, anon;

/** A whole number from JSON between two bounds. */
create or replace function private.json_whole_between(p_value jsonb, p_min bigint, p_max bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'number' and p_value::text ~ '^-?[0-9]+$' and (p_value::text)::numeric between p_min and p_max,
    false
  );
$$;

/** Whether a JSON object has exactly these keys. */
create or replace function private.json_has_keys(p_value jsonb, p_keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
           when jsonb_typeof(p_value) is distinct from 'object' then false
           else (select coalesce(array_agg(k order by k), '{}') from jsonb_object_keys(p_value) as k)
                = (select array_agg(k order by k) from unnest(p_keys) as k)
         end;
$$;

/**
 * What is wrong with a value for a setting, by the field, or null when nothing is. The ranges are
 * the ones the product enforces elsewhere: PRD 11.1 for booking rules (packages/core
 * booking-rules.ts and reminders.ts), and bounds wide enough for any real plan or rule.
 */
create or replace function private.platform_setting_problem(p_key text, p_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return 'value';
  end if;

  case p_key
    when 'booking_defaults' then
      if not private.json_has_keys(p_value, array['buffer_minutes', 'notice_hours', 'horizon_weeks', 'cancellation_window_hours',
                                                  'late_fee_percent', 'request_expiry_hours', 'reminder_hours_before']) then
        return 'value';
      end if;
      if not private.json_whole_between(p_value -> 'buffer_minutes', 0, 60) then return 'buffer_minutes'; end if;
      if not private.json_whole_between(p_value -> 'notice_hours', 0, 72) then return 'notice_hours'; end if;
      if not private.json_whole_between(p_value -> 'horizon_weeks', 1, 26) then return 'horizon_weeks'; end if;
      if not private.json_whole_between(p_value -> 'cancellation_window_hours', 0, 72) then return 'cancellation_window_hours'; end if;
      if not (private.json_whole_between(p_value -> 'late_fee_percent', 0, 100) and (p_value ->> 'late_fee_percent') in ('0', '50', '100')) then
        return 'late_fee_percent';
      end if;
      if not private.json_whole_between(p_value -> 'request_expiry_hours', 1, 48) then return 'request_expiry_hours'; end if;
      if jsonb_typeof(p_value -> 'reminder_hours_before') <> 'array'
         or jsonb_array_length(p_value -> 'reminder_hours_before') not between 1 and 4
         or exists (
           select 1 from jsonb_array_elements(p_value -> 'reminder_hours_before') as hours
            where not private.json_whole_between(hours, 1, 168)
         ) then
        return 'reminder_hours_before';
      end if;
    when 'marketplace_switch_on' then
      if not private.json_has_keys(p_value, array['verified_instructors', 'open_hours_14_days']) then return 'value'; end if;
      if not private.json_whole_between(p_value -> 'verified_instructors', 1, 1000) then return 'verified_instructors'; end if;
      if not private.json_whole_between(p_value -> 'open_hours_14_days', 1, 100000) then return 'open_hours_14_days'; end if;
    when 'plan_limits' then
      if not private.json_has_keys(p_value, array['pro', 'school'])
         or not private.json_has_keys(p_value -> 'pro', array['sms_reminders_per_month'])
         or not private.json_has_keys(p_value -> 'school', array['sms_reminders_per_month']) then
        return 'value';
      end if;
      if not private.json_whole_between(p_value -> 'pro' -> 'sms_reminders_per_month', 0, 10000) then return 'pro'; end if;
      if not private.json_whole_between(p_value -> 'school' -> 'sms_reminders_per_month', 0, 10000) then return 'school'; end if;
    when 'marketplace_fee' then
      if not private.json_has_keys(p_value, array['percent', 'cap_pence']) then return 'value'; end if;
      if not private.json_whole_between(p_value -> 'percent', 0, 20) then return 'percent'; end if;
      if not private.json_whole_between(p_value -> 'cap_pence', 0, 2000) then return 'cap_pence'; end if;
    when 'feature_flags' then
      if not private.json_has_keys(p_value, array['google_sign_in', 'apple_sign_in', 'marketplace']) then return 'value'; end if;
      if exists (select 1 from jsonb_each(p_value) as flag where jsonb_typeof(flag.value) <> 'boolean') then return 'value'; end if;
    else
      -- The founding offer is the pricing page's promise, and changes with it (D-128).
      return 'key';
  end case;
  return null;
end;
$$;

revoke all on function private.json_whole_between(jsonb, bigint, bigint) from public, anon, authenticated;
revoke all on function private.json_has_keys(jsonb, text[]) from public, anon, authenticated;
revoke all on function private.platform_setting_problem(text, jsonb) from public, anon, authenticated;

/** The settings a super admin looks after, for platform staff past their second step (ADM-05). */
create or replace function public.admin_platform_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return (
    select jsonb_object_agg(s.key, jsonb_build_object('value', s.value, 'updated_at', s.updated_at))
      from public.platform_settings s
     where s.key in ('booking_defaults', 'marketplace_switch_on', 'plan_limits', 'marketplace_fee', 'feature_flags')
  );
end;
$$;

revoke all on function public.admin_platform_settings() from public, anon;
grant execute on function public.admin_platform_settings() to authenticated;

/**
 * A super admin past their second step changes one setting (ADM-05, PRD 6.2, D-128). The whole value
 * is checked; nothing changes, and nothing is audited, when it is the same as before.
 */
create or replace function public.admin_set_platform_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_problem text;
  v_before jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff('super') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  v_problem := private.platform_setting_problem(p_key, p_value);
  if v_problem is not null then
    raise exception 'VALIDATION_FAILED' using detail = jsonb_build_object('field', v_problem)::text;
  end if;

  select s.value into v_before from public.platform_settings s where s.key = p_key for update;
  if not found then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "key"}';
  end if;
  if v_before = p_value then
    return;
  end if;

  update public.platform_settings set value = p_value, updated_at = now() where key = p_key;
  perform private.write_audit('platform.setting_changed', 'platform_setting', null, null,
    jsonb_build_object('key', p_key, 'value', v_before),
    jsonb_build_object('key', p_key, 'value', p_value));
end;
$$;

revoke all on function public.admin_set_platform_setting(text, jsonb) from public, anon;
grant execute on function public.admin_set_platform_setting(text, jsonb) to authenticated;

/** Which features are switched on, for every page, signed in or not. Nothing else about the platform. */
create or replace function public.feature_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value from public.platform_settings s where s.key = 'feature_flags'), '{}'::jsonb);
$$;

revoke all on function public.feature_flags() from public;
grant execute on function public.feature_flags() to anon, authenticated;

/** The plan limits, for the jobs that send text messages (NTF-01). */
create or replace function public.system_plan_limits()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value from public.platform_settings s where s.key = 'plan_limits'), '{}'::jsonb);
$$;

revoke all on function public.system_plan_limits() from public, anon, authenticated;
grant execute on function public.system_plan_limits() to service_role;

/**
 * Lessons starting within the next few hours, with everything a reminder needs (NTF-02), now with
 * the platform's default reminder times for a Business that has not set its own.
 */
create or replace function public.system_due_reminders(p_within_hours integer default 26)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with platform as (
    select (select s.value from public.platform_settings s where s.key = 'booking_defaults') as defaults
  )
  select coalesce(jsonb_agg(notice), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'booking_id', b.id,
               'business_id', b.business_id,
               'business_plan', bu.plan::text,
               'reminder_settings', bu.settings,
               'platform_reminder_settings', p.defaults,
               'version', b.version,
               'starts_at', b.starts_at,
               'created_at', b.created_at,
               'learner_user_id', b.learner_id,
               'learner_name', l.full_name,
               'learner_phone', l.phone,
               'instructor_user_id', i.user_id,
               'instructor_name', i.display_name,
               'school_user_ids', '[]'::jsonb
             ) as notice
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
        join public.businesses bu on bu.id = b.business_id
        join public.users l on l.id = b.learner_id
        cross join platform p
       where b.status = 'confirmed'
         and b.starts_at > now()
         and b.starts_at <= now() + make_interval(hours => greatest(coalesce(p_within_hours, 26), 1))
       order by b.starts_at
       limit 500
    ) as due;
$$;
