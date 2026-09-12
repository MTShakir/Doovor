-- Inviting a learner (AUTH-07, M2-03).
--
-- The token travels in the link and is never stored: only its SHA-256 hash is, so a copy of
-- the table is not a set of working invitations. It is returned exactly once, by the function
-- that makes it.

create or replace function private.invitation_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------------------
-- invite_learner: one link, for one learner, from one instructor.
-- ---------------------------------------------------------------------------------------
create or replace function public.invite_learner(
  p_instructor_id uuid,
  p_channel text,
  p_full_name text default null,
  p_email text default null,
  p_phone text default null
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
     and not private.auth_has_permission(v_business, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_channel not in ('email', 'sms', 'whatsapp', 'link') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "channel"}';
  end if;

  -- One instructor, thirty invitations an hour: enough for a busy day, not for a script.
  if not private.rate_limit_hit('invite:' || v_user::text, interval '1 hour', 30) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  -- 32 random bytes, in the alphabet a link can carry without escaping.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.invitations (business_id, kind, instructor_id, channel, email, phone, full_name, token_hash, invited_by)
  values (
    v_business, 'learner', p_instructor_id, p_channel,
    nullif(btrim(lower(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_full_name, '')), ''),
    private.invitation_hash(v_token),
    v_user
  )
  returning id, invitations.expires_at into v_id, v_expires;

  perform private.write_audit('learner.invited', 'invitation', v_id, v_business, null,
    jsonb_build_object('instructor_profile_id', p_instructor_id, 'channel', p_channel));

  -- The only time the token exists outside the link.
  return query select v_id, v_token, v_expires;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- invitation_details: what the landing page may say before anyone signs in (AUTH-07).
--
-- A name and nothing else. Enumerating tokens tells a stranger only that an instructor of
-- some name exists, which their public profile says anyway.
-- ---------------------------------------------------------------------------------------
create or replace function public.invitation_details(p_token text)
returns table (instructor_name text, business_name text, full_name text, email text, expired boolean)
language sql
stable
security definer
set search_path = ''
as $$
  -- Never null: a learner invitation names an instructor, and the business stands in for the
  -- staff invitations the same table carries (SCH-02).
  select coalesce(p.display_name, b.name),
         b.name,
         i.full_name,
         i.email,
         (i.expires_at <= now() or i.accepted_at is not null or i.revoked_at is not null)
    from public.invitations i
    join public.businesses b on b.id = i.business_id
    left join public.instructor_profiles p on p.id = i.instructor_id
   where i.token_hash = private.invitation_hash(p_token)
     and i.kind = 'learner';
$$;

-- ---------------------------------------------------------------------------------------
-- accept_invitation: the learner, now signed in, is linked to the instructor.
-- ---------------------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invite public.invitations;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_invite from public.invitations
   where token_hash = private.invitation_hash(p_token) and kind = 'learner'
   for update;

  if v_invite.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "token", "reason": "expired"}';
  end if;

  -- A learner profile is created at sign-up; an invitation accepted by anyone else is not one.
  if not exists (select 1 from public.learner_profiles where user_id = v_user) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source)
  values (v_invite.business_id, v_user, v_invite.instructor_id, 'enquiry', 'invite')
  on conflict (business_id, learner_id) do update
    set instructor_id = coalesce(excluded.instructor_id, public.learner_relationships.instructor_id);

  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;

  perform private.write_audit('learner.invitation_accepted', 'invitation', v_invite.id, v_invite.business_id, null,
    jsonb_build_object('learner_id', v_user, 'instructor_profile_id', v_invite.instructor_id));

  return v_invite.business_id;
end;
$$;

/** Expired invitations are of no use to anyone. Called by the daily maintenance job. */
create or replace function public.system_clear_expired_invitations(p_older_than interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with cleared as (
    delete from public.invitations
     where accepted_at is null and expires_at < now() - p_older_than
    returning 1
  )
  select count(*)::int into v_count from cleared;
  return v_count;
end;
$$;

revoke all on function public.invite_learner(uuid, text, text, text, text) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
revoke all on function public.system_clear_expired_invitations(interval) from public, anon, authenticated;
grant execute on function public.invite_learner(uuid, text, text, text, text) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.system_clear_expired_invitations(interval) to service_role;
-- The landing page is read before anyone has an account (AUTH-07).
grant execute on function public.invitation_details(text) to anon, authenticated;
