-- One badge number, one account (INS-02, D-230).
--
-- A badge number identifies one instructor to the DVSA, so two accounts holding the same one means
-- either somebody mistyped theirs or somebody is using a badge that is not theirs. Nothing stopped
-- it: the number was checked for shape and never for whether it was already here.
--
-- Two things, because they answer different questions. The index is the guarantee, and it holds
-- whatever writes the row, including a hand-edit in the dashboard. The check inside
-- `submit_verification` is so the person onboarding reads a sentence that tells them what to do
-- rather than a constraint violation, and it names its own error so the screen can say it with the
-- support address in it (rule 8 keeps that address in brand.ts, out of the database).
--
-- Blank is not a badge number and null is not either: neither blocks anybody, and the index leaves
-- both alone. Comparing them folded and trimmed means "123456 " and "123456" are the same badge,
-- which is what a person means by it.

create unique index if not exists instructor_profiles_badge_number_once
  on public.instructor_profiles (upper(btrim(badge_number)))
  where badge_number is not null and btrim(badge_number) <> '';

comment on index public.instructor_profiles_badge_number_once is
  'One account per badge number (INS-02, D-230).';

create or replace function public.submit_verification(
  p_profile_id uuid,
  p_qualification public.instructor_qualification,
  p_badge_number text,
  p_badge_expiry date,
  p_dbs_confirmed boolean,
  p_badge_path text default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := upper(trim(coalesce(p_badge_number, '')));
  v_business uuid;
  v_before jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_profile_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_number !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeNumber"}';
  end if;
  if p_badge_expiry is null or p_badge_expiry <= private.today() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeExpiry"}';
  end if;
  -- Teaching a learner requires a current enhanced check.
  if p_dbs_confirmed is not true then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dbsConfirmed"}';
  end if;
  if p_badge_path is not null and p_badge_path !~ ('^' || p_profile_id::text || '/[a-z0-9-]{8,64}\.webp$') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgePath"}';
  end if;

  -- One badge, one account (INS-02, D-230). The index below is what actually guarantees it; this
  -- is here so the screen can say something useful instead of showing a constraint violation.
  if exists (
    select 1
      from public.instructor_profiles other
     where other.id <> p_profile_id
       and upper(btrim(coalesce(other.badge_number, ''))) = v_number
  ) then
    raise exception 'BADGE_TAKEN' using errcode = 'P0001';
  end if;

  select business_id,
         jsonb_build_object(
           'qualification', qualification,
           'badge_number', badge_number,
           'verification_status', verification_status
         )
    into v_business, v_before
    from public.instructor_profiles
   where id = p_profile_id;

  update public.instructor_profiles
     set qualification = p_qualification,
         badge_number = v_number,
         badge_expiry = p_badge_expiry,
         badge_path = coalesce(p_badge_path, badge_path),
         dbs_confirmed_at = now(),
         verification_status = 'pending',
         verification_submitted_at = now(),
         verification_decision_reason = null,
         verified_at = null
   where id = p_profile_id;

  perform private.write_audit(
    'instructor.verification_submitted', 'instructor_profile', p_profile_id, v_business, v_before,
    jsonb_build_object('qualification', p_qualification, 'badge_number', v_number, 'verification_status', 'pending')
  );

  -- Staff are told there is something to review, outside this transaction (D-017).
  perform private.enqueue_event(
    'instructor/verification-submitted',
    jsonb_build_object('instructor_profile_id', p_profile_id, 'business_id', v_business)
  );

  return 'pending'::public.verification_status;
end;
$$;