-- Setting a whole week of working hours at once (DIA-01, AUTH-04, M1-09).
--
-- A week is replaced, not edited row by row: the table has an exclusion constraint that stops
-- two ranges overlapping on a day, so deleting and inserting halfway through would leave an
-- instructor with a week nobody asked for. One function, one transaction.
--
-- Times are local wall clock (`time`, not `timestamptz`) and are stored exactly as chosen:
-- 09:00 stays 09:00 through a clock change, which is what a working week means (R-14).

create or replace function public.set_working_hours(
  p_instructor_id uuid,
  p_weekdays smallint[],
  p_start_time time,
  p_end_time time
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_day smallint;
  v_written integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
     and not private.auth_has_permission(v_business, 'manage_availability') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_weekdays is null or cardinality(p_weekdays) = 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "days"}';
  end if;
  if exists (select 1 from unnest(p_weekdays) as day where day not between 1 and 7) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "days"}';
  end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "endTime"}';
  end if;

  delete from public.working_hours where instructor_id = p_instructor_id;

  foreach v_day in array p_weekdays loop
    insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
    values (p_instructor_id, v_business, v_day, p_start_time, p_end_time)
    on conflict do nothing;
    v_written := v_written + 1;
  end loop;

  perform private.write_audit(
    'instructor.hours_set', 'instructor_profile', p_instructor_id, v_business, null,
    jsonb_build_object('weekdays', p_weekdays, 'start_time', p_start_time, 'end_time', p_end_time)
  );
  return v_written;
end;
$$;

revoke all on function public.set_working_hours(uuid, smallint[], time, time) from public, anon;
grant execute on function public.set_working_hours(uuid, smallint[], time, time) to authenticated;
