-- A reminder sent by hand, from a lesson's sheet (NTF-02, D-166).
--
-- The product owner asked for a "Send a reminder" button on a lesson, by email or, on Pro, by
-- text. The instructor asks here; the job that sends reminders does the rest, through the same
-- notifications, the same words and the same settings as the automatic ones, so a learner who
-- has switched email reminders off is not emailed because somebody pressed a button.

-- Whether a Business's plan includes text messages (NTF-01): its plan's allowance in the platform
-- settings, where the admin screen always names Pro and Schools. A plan they do not name has none.
create or replace function private.business_can_text(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
              when jsonb_typeof(allowance) = 'number' then (allowance #>> '{}')::numeric > 0
              else false
            end
       from (select (select s.value from public.platform_settings s where s.key = 'plan_limits')
                      -> (b.plan::text) -> 'sms_reminders_per_month' as allowance
               from public.businesses b
              where b.id = p_business_id) as plan),
    false
  );
$$;

revoke all on function private.business_can_text(uuid) from public, anon, authenticated;

create or replace function public.request_lesson_reminder(p_booking_id uuid, p_channel text)
returns void
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
  if p_channel is null or p_channel not in ('email', 'sms') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "channel"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- The lesson's instructor, or somebody who runs the Business's bookings.
  if not (
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
    or private.auth_has_permission(v_booking.business_id, 'manage_bookings')
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- A reminder is about a lesson that is still to come.
  if v_booking.status <> 'confirmed' or v_booking.starts_at <= now() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  -- A text only on a plan that has them (NTF-01).
  if p_channel = 'sms' and not private.business_can_text(v_booking.business_id) then
    raise exception 'PLAN_REQUIRED' using errcode = 'P0001';
  end if;

  -- One of each an hour for a lesson: a reminder is a nudge, and a learner sent five of them is
  -- a learner who switches reminders off.
  if not private.rate_limit_hit('reminder:' || p_booking_id::text || ':' || p_channel, interval '1 hour', 1) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  perform private.write_audit('booking.reminder_requested', 'booking', p_booking_id, v_booking.business_id,
    null, jsonb_build_object('channel', p_channel));
  perform private.enqueue_event('booking.reminder_requested',
    jsonb_build_object('booking_id', p_booking_id, 'channel', p_channel, 'requested_at', now()));
end;
$$;

revoke all on function public.request_lesson_reminder(uuid, text) from public, anon;
grant execute on function public.request_lesson_reminder(uuid, text) to authenticated;

-- What the lesson's sheet may offer: whether a reminder can go by text. Only the answer, never the
-- plan, which is the owner's to see (D-123), and only to somebody who may send the reminder.
create or replace function public.lesson_reminder_options(p_booking_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not (
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
    or private.auth_has_permission(v_booking.business_id, 'manage_bookings')
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return jsonb_build_object('texts', private.business_can_text(v_booking.business_id));
end;
$$;

revoke all on function public.lesson_reminder_options(uuid) from public, anon;
grant execute on function public.lesson_reminder_options(uuid) to authenticated;

-- The one lesson a reminder was asked for, shaped as one row of system_due_reminders, so the job
-- plans it with the same code. Nothing for a lesson that is no longer on, or has happened.
create or replace function public.system_reminder_notice(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'booking_id', b.id,
           'business_id', b.business_id,
           'business_plan', bu.plan::text,
           'reminder_settings', bu.settings,
           'platform_reminder_settings', (select s.value from public.platform_settings s where s.key = 'booking_defaults'),
           'version', b.version,
           'starts_at', b.starts_at,
           'created_at', b.created_at,
           'learner_user_id', b.learner_id,
           'learner_name', l.full_name,
           'learner_phone', l.phone,
           'instructor_user_id', i.user_id,
           'instructor_name', i.display_name,
           'school_user_ids', '[]'::jsonb
         )
    from public.bookings b
    join public.instructor_profiles i on i.id = b.instructor_id
    join public.businesses bu on bu.id = b.business_id
    join public.users l on l.id = b.learner_id
   where b.id = p_booking_id
     and b.status = 'confirmed'
     and b.starts_at > now();
$$;

revoke all on function public.system_reminder_notice(uuid) from public, anon, authenticated;
grant execute on function public.system_reminder_notice(uuid) to service_role;
