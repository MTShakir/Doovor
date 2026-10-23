-- A lesson booked every week until it is stopped can be stopped (BOK-05, D-380).
--
-- "Every week until I stop it" made a weekly slot with no end, and the nightly sweep kept booking
-- it four weeks ahead. `stop_recurrence` has existed since the slot did, but nothing in the app
-- called it, so the only way to stop one was to cancel each lesson the sweep made, every week,
-- for ever. The lesson's sheet now offers it. Two things also stop a slot without anybody asking,
-- because a learner who has gone should not go on being booked:
--
--   * Marking a learner as having left stops their open weekly slots with that Business, written
--     to the audit log as the person who marked them.
--   * The sweep stops, rather than books, an open slot whose learner has left the Business or is
--     no longer with it at all. That covers slots of learners who left before this migration.
--
-- Lessons already in the diary stay, as they always did when a slot was stopped: they are
-- appointments with a person, and calling them off is the instructor's to do and the learner's to
-- be told about, one lesson at a time.

-- ---------------------------------------------------------------------------------------
-- Leaving stops the slot.
-- ---------------------------------------------------------------------------------------
create or replace function private.learner_left_stops_weekly_lessons()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Decided here rather than in a WHEN on the trigger, which would run as whoever is writing.
  if new.status <> 'left' or old.status = 'left' then
    return null;
  end if;

  for v_id in
    update public.booking_recurrences
       set cancelled_at = now()
     where business_id = new.business_id
       and learner_id = new.learner_id
       and ends_on is null
       and cancelled_at is null
    returning id
  loop
    perform private.write_audit('booking.repeat_stopped', 'booking_recurrence', v_id, new.business_id);
  end loop;
  return null;
end;
$$;

revoke all on function private.learner_left_stops_weekly_lessons() from public, anon, authenticated;

create trigger learner_relationships_left_stops_weekly_lessons
  after update of status on public.learner_relationships
  for each row execute function private.learner_left_stops_weekly_lessons();

-- ---------------------------------------------------------------------------------------
-- The sweep books nobody who has gone.
-- ---------------------------------------------------------------------------------------
create or replace function public.system_extend_recurrences(p_weeks integer default 4)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.booking_recurrences;
  v_date date;
  v_when timestamptz;
  v_made integer := 0;
  v_horizon date := (now() at time zone 'Europe/London')::date + p_weeks * 7;
begin
  -- A slot whose learner has left, or is no longer with the Business at all, is stopped. Written
  -- down as the system, since nobody asked.
  for v_row in
    update public.booking_recurrences r
       set cancelled_at = now()
     where r.cancelled_at is null
       and r.ends_on is null
       and not exists (
         select 1 from public.learner_relationships l
          where l.business_id = r.business_id
            and l.learner_id = r.learner_id
            and l.status <> 'left'
       )
    returning r.*
  loop
    perform private.write_audit('booking.repeat_stopped', 'booking_recurrence', v_row.id, v_row.business_id);
  end loop;

  for v_row in
    select * from public.booking_recurrences
     where cancelled_at is null and ends_on is null
  loop
    v_date := coalesce(v_row.booked_until, v_row.starts_on - 7) + 7;
    while v_date <= v_horizon loop
      v_when := (v_date + v_row.local_time) at time zone 'Europe/London';
      if v_when > now() then
        begin
          perform private.book_for_recurrence(v_row, v_when);
          v_made := v_made + 1;
        exception
          when others then null;
        end;
      end if;
      update public.booking_recurrences set booked_until = v_date where id = v_row.id;
      v_date := v_date + 7;
    end loop;
  end loop;

  return v_made;
end;
$$;

revoke all on function public.system_extend_recurrences(integer) from public, anon, authenticated;
grant execute on function public.system_extend_recurrences(integer) to service_role;
