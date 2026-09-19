-- Housekeeping: what the privacy notice promises is kept, and nothing is kept longer
-- (NFR-PRV-03, NFR-SEC-06, D-158).
--
-- Three promises in the privacy notice were not being kept, found on 19 September 2026 while the
-- legal review pack was written: the audit trail is kept two years, a badge picture goes once it
-- has been checked, and a deleted person's pictures go with them.
--
-- The first is pruned here, by the one function allowed to. The other two come down to a single
-- rule the job runner carries out every night: a stored picture that nothing in the database
-- points to any more, and that is more than a day old, is removed. A badge stops being pointed to
-- when it is decided, a deleted instructor's pictures when their account is erased, and a
-- replaced photo as soon as the new one is saved. The day's grace is for a picture uploaded and
-- not yet saved to a profile.

-- ---------------------------------------------------------------------------------------
-- 1. The audit trail: two years.
-- ---------------------------------------------------------------------------------------

-- Still append-only, with one way out: rows more than two years old, while the transaction is
-- marked as pruning by public.system_prune_audit_log. Nothing newer can go, whoever asks.
create or replace function private.prevent_audit_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('private.pruning_audit', true) = 'on' and old.occurred_at < now() - interval '2 years' then
      return old;
    end if;
  end if;
  raise exception 'audit_log is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create or replace function public.system_prune_audit_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Fixed here rather than passed in, so no caller can choose a shorter memory.
  v_before timestamptz := now() - interval '2 years';
  v_removed integer;
begin
  perform set_config('private.pruning_audit', 'on', true);
  delete from public.audit_log where occurred_at < v_before;
  get diagnostics v_removed = row_count;
  perform set_config('private.pruning_audit', 'off', true);

  if v_removed > 0 then
    perform private.write_audit(
      'audit_log.pruned', 'audit_log', null, null, null,
      jsonb_build_object('removed', v_removed, 'before', v_before), null, 'system'
    );
  end if;
  return v_removed;
end;
$$;

comment on function public.system_prune_audit_log() is 'Removes audit rows more than two years old, the period the privacy notice gives (D-158).';

revoke all on function public.system_prune_audit_log() from public, anon, authenticated;
grant execute on function public.system_prune_audit_log() to service_role;

-- ---------------------------------------------------------------------------------------
-- 2. A badge picture goes once it has been checked.
-- ---------------------------------------------------------------------------------------

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
         verification_decision_reason = left(v_reason, 500),
         -- Checked, so no longer needed: the nightly job removes the picture (D-158).
         badge_path = null
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

-- Pictures of badges checked before today, and of deleted instructors, go the same way.
update public.instructor_profiles
   set badge_path = null
 where badge_path is not null
   and verification_status in ('approved', 'rejected');

update public.instructor_profiles p
   set badge_path = null
  from public.users u
 where u.id = p.user_id
   and u.deleted_at is not null
   and p.badge_path is not null;

-- ---------------------------------------------------------------------------------------
-- 3. A deleted person's pictures go with them: the badge too, not only the photo.
-- ---------------------------------------------------------------------------------------

create or replace function public.system_erase_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  -- A lesson still to come is called off: a diary that promises a lesson nobody will teach or take
  -- is worse than an empty one. The money for it stays where it is, and the Business settles it.
  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = 'The learner closed their account',
         updated_at = now()
   where learner_id = p_user_id
     and starts_at > now()
     and status in ('confirmed', 'requested', 'pending_payment');

  -- Their part of every Business they learn with ends.
  update public.learner_relationships
     set status = 'left', updated_at = now()
   where learner_id = p_user_id
     and status <> 'left';

  -- What a Business wrote about them goes: it is about a person, and there is no person now.
  delete from public.learner_notes where learner_id = p_user_id;
  delete from public.learner_private where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.notification_preferences where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.invitations where lower(email) = (select lower(u.email) from public.users u where u.id = p_user_id);

  update public.learner_profiles
     set postcode = null,
         location = null,
         updated_at = now()
   where user_id = p_user_id;

  -- An instructor's public profile goes with them: no booking link, nothing in search, no words
  -- or picture of theirs left on it. What the Business keeps is that somebody taught the lessons.
  update public.instructor_profiles
     set display_name = 'Former instructor',
         bio = null,
         photo_path = null,
         languages = '{}',
         badge_number = null,
         badge_path = null,
         public_slug = null,
         is_listed = false,
         base_postcode = null,
         base_location = null,
         updated_at = now()
   where user_id = p_user_id;

  -- And their way in to every Business.
  update public.memberships
     set status = 'deactivated', updated_at = now()
   where user_id = p_user_id
     and status <> 'deactivated';

  -- The account itself: banned for good, with nothing left to sign in with, and every session
  -- already open ended (D-126 does the refusing).
  delete from auth.identities where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  update auth.users
     set email = 'deleted+' || p_user_id::text || '@invalid',
         phone = null,
         encrypted_password = null,
         email_change = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '1000 years',
         updated_at = now()
   where id = p_user_id;

  -- The person, in our own records. After the account above, because a change to its email is
  -- mirrored into this row by a trigger, and what should be left here is nothing.
  update public.users
     set full_name = 'Deleted account',
         email = null,
         phone = null,
         avatar_url = null,
         marketing_consent = false,
         marketing_consent_at = null,
         analytics_consent = false,
         intended_role = null,
         deleted_at = now(),
         updated_at = now()
   where id = p_user_id;

  select b.id into v_business from public.businesses b
    join public.memberships m on m.business_id = b.id
   where m.user_id = p_user_id
   limit 1;
  perform private.write_audit('account.deleted', 'user', p_user_id, v_business, null, null, p_user_id, 'system');
end;
$$;

-- ---------------------------------------------------------------------------------------
-- 4. What the nightly job removes: stored pictures nothing points to, a day on.
-- ---------------------------------------------------------------------------------------

-- Only inside the folders this product writes (a profile's own folder, and a school's), so a
-- file put anywhere else by hand is never touched.
create or replace function public.system_unreferenced_files(p_limit integer default 500)
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id::text, o.name
    from storage.objects o
   where o.created_at < now() - interval '1 day'
     and (
       (o.bucket_id = 'badges' and o.name ~ '^[0-9a-f-]{36}/[^/]+$')
       or (o.bucket_id = 'avatars' and o.name ~ '^([0-9a-f-]{36}|businesses/[0-9a-f-]{36})/[^/]+$')
     )
     and not exists (
       select 1 from public.instructor_profiles p
        where (o.bucket_id = 'avatars' and p.photo_path = o.name)
           or (o.bucket_id = 'badges' and p.badge_path = o.name)
     )
     and not exists (
       select 1 from public.businesses b
        where o.bucket_id = 'avatars' and b.logo_url = o.name
     )
   order by o.created_at
   limit greatest(least(p_limit, 1000), 0);
$$;

comment on function public.system_unreferenced_files(integer) is 'Stored pictures nothing points to any more, a day on, for the nightly job to remove (D-158).';

revoke all on function public.system_unreferenced_files(integer) from public, anon, authenticated;
grant execute on function public.system_unreferenced_files(integer) to service_role;
