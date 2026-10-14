-- A badge is sent with its photo, a PNG photo is accepted, and the number is digits (INS-02, D-262).
--
-- Three changes to submit_verification, from the product owner testing onboarding on a phone:
--
-- The photo path had to end in .webp. Since D-224 a browser that cannot write WebP stores the
-- picture as PNG, which the badges bucket accepts, so the upload worked and the submission was then
-- refused, with nothing on the screen to say which field was wrong. PNG is accepted here too.
--
-- A badge could be sent with no photo at all, and a person cannot check a number without seeing the
-- badge. It now needs one: the photo sent with it, or one already on file from before. Skipping the
-- step altogether still sends nothing.
--
-- The number was any 4 to 12 letters or digits (D-056). ADI badges carry six digits, so the shape is
-- now digits, five to seven of them, ignoring spaces: tight enough to catch a driving licence or a
-- phone number typed into it, loose enough not to turn away a badge from before or after today's
-- numbering. A person still checks it against the register before the tick is granted.

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
  v_number text := regexp_replace(coalesce(p_badge_number, ''), '\s', '', 'g');
  v_business uuid;
  v_before jsonb;
  v_stored_path text;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_profile_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_number !~ '^[0-9]{5,7}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeNumber"}';
  end if;
  if p_badge_expiry is null or p_badge_expiry <= private.today() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeExpiry"}';
  end if;
  -- Teaching a learner requires a current enhanced check.
  if p_dbs_confirmed is not true then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dbsConfirmed"}';
  end if;
  -- What a canvas writes: WebP, or PNG where the browser cannot write WebP (D-224).
  if p_badge_path is not null and p_badge_path !~ ('^' || p_profile_id::text || '/[a-z0-9-]{8,64}\.(webp|png)$') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgePath"}';
  end if;

  -- One badge, one account (INS-02, D-230). The index is what actually guarantees it; this is here
  -- so the screen can say something useful instead of showing a constraint violation. Before the
  -- photo, because "that badge is already here" is the more useful thing to be told.
  if exists (
    select 1
      from public.instructor_profiles other
     where other.id <> p_profile_id
       and upper(btrim(coalesce(other.badge_number, ''))) = v_number
  ) then
    raise exception 'BADGE_TAKEN' using errcode = 'P0001';
  end if;

  select business_id,
         badge_path,
         jsonb_build_object(
           'qualification', qualification,
           'badge_number', badge_number,
           'verification_status', verification_status
         )
    into v_business, v_stored_path, v_before
    from public.instructor_profiles
   where id = p_profile_id;

  -- A badge is checked from its photo: the one sent now, or one still on file from before. A
  -- decision clears the photo (D-158), so sending again after one needs a new photo.
  if p_badge_path is null and v_stored_path is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgePath"}';
  end if;

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
