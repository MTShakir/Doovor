-- Deciding a verification (INS-02, ADM-03, M1-12).
--
-- The blue tick is the one thing a learner is asked to trust, so only platform staff can
-- grant it, only with two-step verification, and every decision leaves an audit row saying
-- who made it. A rejection must say why, because the instructor is told the reason.

create or replace function public.decide_verification(
  p_profile_id uuid,
  p_approved boolean,
  p_reason text default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_before jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_status public.verification_status :=
    case when p_approved then 'approved'::public.verification_status else 'rejected'::public.verification_status end;
begin
  if not (select private.auth_is_staff()) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not p_approved and v_reason is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  select business_id, jsonb_build_object('verification_status', verification_status)
    into v_business, v_before
    from public.instructor_profiles
   where id = p_profile_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  update public.instructor_profiles
     set verification_status = v_status,
         verified_at = case when p_approved then now() end,
         verification_decision_reason = left(v_reason, 500)
   where id = p_profile_id;

  perform private.write_audit(
    'instructor.verification_decided', 'instructor_profile', p_profile_id, v_business, v_before,
    jsonb_build_object('verification_status', v_status, 'reason', left(v_reason, 500))
  );

  -- The instructor is told outside this transaction (D-017). Identifiers only.
  perform private.enqueue_event(
    'instructor/verification-decided',
    jsonb_build_object('instructor_profile_id', p_profile_id, 'business_id', v_business, 'status', v_status)
  );

  return v_status;
end;
$$;

revoke all on function public.decide_verification(uuid, boolean, text) from public, anon;
grant execute on function public.decide_verification(uuid, boolean, text) to authenticated;

-- Staff read the queue. The profile policy already lets staff select, so this is only about
-- the badge photo, which is in the private bucket and reached through a signed address.
