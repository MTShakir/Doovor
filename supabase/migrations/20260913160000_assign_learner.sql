-- A school moves a learner between its instructors, and the learner keeps the story of it
-- (LRN-06, M2-10).

create or replace function public.assign_learner(p_learner_id uuid, p_instructor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_link public.learner_relationships;
  v_business uuid;
  v_was text;
  v_now text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- Only somebody who runs the Business moves people about in it.
  if not private.auth_has_permission(v_business, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select * into v_link
    from public.learner_relationships
   where learner_id = p_learner_id and business_id = v_business
   for update;
  if v_link.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_link.instructor_id = p_instructor_id then
    return v_link.id;
  end if;

  select display_name into v_was from public.instructor_profiles where id = v_link.instructor_id;
  select display_name into v_now from public.instructor_profiles where id = p_instructor_id;

  update public.learner_relationships set instructor_id = p_instructor_id where id = v_link.id;

  -- The names as they were on the day: the record should still read true after a rename.
  perform private.write_audit(
    'learner.reassigned', 'learner_relationship', v_link.id, v_business,
    jsonb_build_object('instructor_profile_id', v_link.instructor_id, 'instructor_name', v_was),
    jsonb_build_object('instructor_profile_id', p_instructor_id, 'instructor_name', v_now)
  );

  return v_link.id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- learner_history: what has happened to one learner here (LRN-06).
--
-- The audit log itself is read by platform staff only. This hands back the few rows about
-- one learner, to the people who already work with that learner.
-- ---------------------------------------------------------------------------------------
create or replace function public.learner_history(p_learner_id uuid)
returns table (happened_at timestamptz, action text, before jsonb, after jsonb, actor_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_can_see_learner(p_learner_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select r.id into v_link
    from public.learner_relationships r
   where r.learner_id = p_learner_id
     and (
       r.instructor_id in (select private.auth_instructor_ids())
       or r.business_id in (select private.auth_business_ids())
     )
   limit 1;
  if v_link is null then
    return;
  end if;

  return query
    select a.occurred_at,
           a.action,
           a.before,
           a.after,
           coalesce(u.full_name, 'Somebody here')
      from public.audit_log a
      left join public.users u on u.id = a.actor_user_id
     where a.entity = 'learner_relationship'
       and a.entity_id = v_link
     order by a.occurred_at desc
     limit 50;
end;
$$;

revoke all on function public.assign_learner(uuid, uuid) from public, anon;
revoke all on function public.learner_history(uuid) from public, anon;
grant execute on function public.assign_learner(uuid, uuid) to authenticated;
grant execute on function public.learner_history(uuid) to authenticated;
