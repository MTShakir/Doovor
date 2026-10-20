-- A school adds and imports learners of its own (M9-27, D-294).
--
-- As an instructor adds a learner they already teach (LRN-03, D-068), a school's office adds one by
-- hand or from a spreadsheet: the app makes the account they will claim, and this links it to the
-- school, with one of its instructors or with nobody yet, for the school to choose (SCH-03).

create function public.add_school_learner(
  p_school_id uuid,
  p_learner_id uuid,
  p_instructor_id uuid default null,
  p_postcode text default null,
  p_transmission text default null,
  p_source text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_school_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_school_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_source not in ('manual', 'import') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "source"}';
  end if;
  if p_transmission is not null and p_transmission not in ('manual', 'automatic') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "transmission"}';
  end if;
  -- One of the school's own instructors, still teaching there, or nobody yet.
  if p_instructor_id is not null and not exists (
    select 1
      from public.instructor_profiles p
      join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
     where p.id = p_instructor_id and p.business_id = p_school_id
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "instructor"}';
  end if;

  if exists (select 1 from public.memberships where business_id = p_school_id and user_id = p_learner_id) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "learner"}';
  end if;
  if exists (select 1 from public.learner_relationships where business_id = p_school_id and learner_id = p_learner_id) then
    raise exception 'DUPLICATE_CONTACT' using errcode = '23505';
  end if;
  -- Only the account the app has just made for this learner (D-068), as for an instructor.
  if not exists (
       select 1
         from auth.users u
        where u.id = p_learner_id
          and u.email_confirmed_at is null
          and u.phone_confirmed_at is null
          and u.last_sign_in_at is null
     )
     or exists (select 1 from public.learner_relationships where learner_id = p_learner_id) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- The same allowance as an instructor's: an afternoon of typing and an import, not a script.
  if not private.rate_limit_hit('add_learner:' || v_user::text, interval '1 hour', 300) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  insert into public.learner_profiles (user_id, postcode, location, transmission)
  values (
    p_learner_id,
    nullif(btrim(upper(coalesce(p_postcode, ''))), ''),
    (select location from public.postcodes where postcode = nullif(btrim(upper(coalesce(p_postcode, ''))), '')),
    nullif(p_transmission, '')::public.learner_transmission
  )
  on conflict (user_id) do update
     set postcode = coalesce(excluded.postcode, public.learner_profiles.postcode),
         location = coalesce(excluded.location, public.learner_profiles.location),
         transmission = coalesce(excluded.transmission, public.learner_profiles.transmission);

  insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, created_by)
  values (p_school_id, p_learner_id, p_instructor_id, 'active', p_source::public.learner_source, v_user)
  returning id into v_id;

  perform private.write_audit('learner.added', 'learner_relationship', v_id, p_school_id, null,
    jsonb_build_object('learner_id', p_learner_id, 'instructor_profile_id', p_instructor_id, 'source', p_source));

  return v_id;
end;
$$;

revoke all on function public.add_school_learner(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.add_school_learner(uuid, uuid, uuid, text, text, text) to authenticated;
