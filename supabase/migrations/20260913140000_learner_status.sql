-- Moving a learner through the six statuses (LRN-05, M2-07).
--
-- The relationship carries the status, and nobody holds an update grant on it: this is the
-- only way it changes, so every move is checked and every move is logged.

create or replace function public.set_learner_status(
  p_learner_id uuid,
  p_status text,
  p_reason text default null
)
returns public.learner_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_relationship public.learner_relationships;
  v_matches integer;
  v_status public.learner_status;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('enquiry', 'waiting', 'active', 'test_booked', 'passed', 'left') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;
  v_status := p_status::public.learner_status;

  -- The caller acts for one Business at a time. A learner they teach in two of them is not
  -- an ambiguity to guess at.
  select count(*) into v_matches
    from public.learner_relationships r
   where r.learner_id = p_learner_id
     and (
       r.instructor_id in (select private.auth_instructor_ids())
       or private.auth_has_permission(r.business_id, 'manage_members')
     );
  if v_matches = 0 then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_matches > 1 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "business"}';
  end if;

  select * into v_relationship
    from public.learner_relationships r
   where r.learner_id = p_learner_id
     and (
       r.instructor_id in (select private.auth_instructor_ids())
       or private.auth_has_permission(r.business_id, 'manage_members')
     )
     for update;

  if v_relationship.status = v_status then
    return v_status;
  end if;

  update public.learner_relationships
     set status = v_status
   where id = v_relationship.id;

  perform private.write_audit(
    'learner.status_changed', 'learner_relationship', v_relationship.id, v_relationship.business_id,
    jsonb_build_object('status', v_relationship.status),
    jsonb_build_object('status', v_status, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );

  return v_status;
end;
$$;

revoke all on function public.set_learner_status(uuid, text, text) from public, anon;
grant execute on function public.set_learner_status(uuid, text, text) to authenticated;
