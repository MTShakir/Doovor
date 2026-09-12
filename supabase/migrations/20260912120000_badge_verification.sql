-- Badge photos and the verification submission (INS-02, AUTH-04, M1-04).
--
-- A badge photo shows a name, a number and a face. It is not public like an avatar: only the
-- instructor it belongs to and platform staff reviewing the submission can read it. The
-- submission itself goes through an RPC, so `verification_status` is never set by the person
-- being verified, and every submission leaves an audit row.

alter table public.instructor_profiles
  add column badge_path text,
  add column verification_submitted_at timestamptz,
  add column verification_decision_reason text;

-- Verification fields are set by the RPC below, never by a direct write.
revoke update (qualification, badge_number, badge_expiry, dbs_confirmed_at)
  on public.instructor_profiles from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('badges', 'badges', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Staff read badges to check them against the DVSA register (M1-12). Everyone else, including
-- other instructors in the same school, sees nothing.
create policy badges_read_own_or_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'badges'
    and (
      exists (
        select 1 from private.auth_instructor_ids() as profile_id
         where profile_id::text = (storage.foldername(name))[1]
      )
      or (select private.auth_is_staff())
    )
  );

create policy badges_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'badges'
    and exists (
      select 1 from private.auth_instructor_ids() as profile_id
       where profile_id::text = (storage.foldername(name))[1]
    )
  );

create policy badges_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'badges'
    and exists (
      select 1 from private.auth_instructor_ids() as profile_id
       where profile_id::text = (storage.foldername(name))[1]
    )
  );

create policy badges_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'badges'
    and exists (
      select 1 from private.auth_instructor_ids() as profile_id
       where profile_id::text = (storage.foldername(name))[1]
    )
  );

-- ---------------------------------------------------------------------------------------
-- submit_verification: the instructor sends their badge for review (INS-02).
-- ---------------------------------------------------------------------------------------
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
  if p_badge_expiry is null or p_badge_expiry <= current_date then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeExpiry"}';
  end if;
  -- Teaching a learner requires a current enhanced check.
  if p_dbs_confirmed is not true then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dbsConfirmed"}';
  end if;
  if p_badge_path is not null and p_badge_path !~ ('^' || p_profile_id::text || '/[a-z0-9-]{8,64}\.webp$') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgePath"}';
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

revoke all on function public.submit_verification(
  uuid, public.instructor_qualification, text, date, boolean, text
) from public, anon;
grant execute on function public.submit_verification(
  uuid, public.instructor_qualification, text, date, boolean, text
) to authenticated;
