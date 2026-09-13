-- Adding a learner an instructor already teaches (LRN-03, M2-08).
--
-- The account itself is made by the app through Supabase Auth, because that is the only
-- supported way to create an identity (D-068). This is the rest of it: the learner's own
-- details, the link to the Business, and the record that somebody added them by hand.

create or replace function public.add_learner(
  p_instructor_id uuid,
  p_learner_id uuid,
  p_postcode text default null,
  p_transmission text default null,
  p_source text default 'manual',
  p_usual_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_source not in ('manual', 'import') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "source"}';
  end if;
  if p_transmission is not null and p_transmission not in ('manual', 'automatic') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "transmission"}';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
     and not private.auth_has_permission(v_business, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- Adding somebody who teaches for this Business as one of its learners is a mistake, not
  -- a feature: it would give them a second face in their own diary.
  if exists (select 1 from public.memberships where business_id = v_business and user_id = p_learner_id) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "learner"}';
  end if;
  if exists (select 1 from public.learner_relationships where business_id = v_business and learner_id = p_learner_id) then
    raise exception 'DUPLICATE_CONTACT' using errcode = '23505';
  end if;

  -- Generous enough for an afternoon of typing and a spreadsheet import, not for a script.
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

  insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, usual_duration_minutes, created_by)
  values (v_business, p_learner_id, p_instructor_id, 'active', p_source::public.learner_source, p_usual_minutes, v_user)
  returning id into v_id;

  perform private.write_audit('learner.added', 'learner_relationship', v_id, v_business, null,
    jsonb_build_object('learner_id', p_learner_id, 'instructor_profile_id', p_instructor_id, 'source', p_source));

  return v_id;
end;
$$;

revoke all on function public.add_learner(uuid, uuid, text, text, text, integer) from public, anon;
grant execute on function public.add_learner(uuid, uuid, text, text, text, integer) to authenticated;
