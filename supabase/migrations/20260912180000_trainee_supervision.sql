-- Trainee instructors and who supervises them (INS-04, R-18, M1-14).
--
-- A trainee holds a pink PDI licence and may only teach under a school or an approved
-- instructor. The rule is enforced where a booking is written, not where a booking is asked
-- for, so no later screen or RPC can forget it.

-- The supervisor is set through the function below, never by a direct write: a trainee must
-- not be able to name themselves as supervised.
revoke update (supervisor_business_id, supervisor_instructor_id)
  on public.instructor_profiles from authenticated;

create or replace function private.is_supervised(p_instructor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.qualification <> 'pdi'
         or p.supervisor_business_id is not null
         or p.supervisor_instructor_id is not null
       from public.instructor_profiles p
      where p.id = p_instructor_id),
    false
  );
$$;

create or replace function private.bookings_require_supervision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_supervised(new.instructor_id) then
    raise exception 'PDI_NOT_LINKED'
      using detail = jsonb_build_object('instructor_id', new.instructor_id)::text;
  end if;
  return new;
end;
$$;

create trigger bookings_require_supervision
  before insert or update of instructor_id on public.bookings
  for each row execute function private.bookings_require_supervision();

-- ---------------------------------------------------------------------------------------
-- set_supervisor: a school takes responsibility for a trainee who teaches for it (INS-04).
--
-- Naming a supervisor outside the business is a conversation between two Businesses, so it
-- waits for the school features (D-061). This covers the common case: a trainee on the
-- payroll of the school supervising them.
-- ---------------------------------------------------------------------------------------
create or replace function public.set_supervisor(p_instructor_id uuid, p_supervised boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_qualification public.instructor_qualification;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select business_id, qualification into v_business, v_qualification
    from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(v_business, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_qualification <> 'pdi' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "qualification"}';
  end if;

  update public.instructor_profiles
     set supervisor_business_id = case when p_supervised then v_business end
   where id = p_instructor_id;

  perform private.write_audit(
    'instructor.supervision_changed', 'instructor_profile', p_instructor_id, v_business, null,
    jsonb_build_object('supervised', p_supervised)
  );
  return p_supervised;
end;
$$;

revoke all on function public.set_supervisor(uuid, boolean) from public, anon;
grant execute on function public.set_supervisor(uuid, boolean) to authenticated;
