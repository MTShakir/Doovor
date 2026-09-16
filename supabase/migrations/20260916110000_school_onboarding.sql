-- School onboarding (AUTH-05, PRD 10.5, M5-11).
--
-- A new school's owner says what the school is called, its logo, its main postcode and roughly how
-- many instructors it has, then invites its instructors. An invitation to join a school is a
-- member invitation in the same table as a learner's (D-064): a hashed one-use token, shared from
-- the owner's own phone. Accepting it makes the invited person a member of the school and, for an
-- instructor, gives them a profile there, which they then set up in a shorter onboarding (D-118).

alter table public.businesses
  add column expected_instructors smallint check (expected_instructors is null or expected_instructors between 1 and 500),
  add column onboarding_completed_at timestamptz;

-- Every Business already here has been set up: the seeded and tested schools, and every Business
-- of one, whose onboarding is its instructor's (AUTH-04).
update public.businesses set onboarding_completed_at = created_at where onboarding_completed_at is null;

grant update (expected_instructors, onboarding_completed_at) on public.businesses to authenticated;

-- A school is set up by its owner after sign-up; a Business of one needs nothing more than its
-- instructor's own onboarding. Otherwise as before (M0).
create or replace function public.create_business(p_type public.business_type, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_offer jsonb;
  v_limit int;
  v_used bigint;
  v_plan public.plan_key := 'free'::public.plan_key;
  v_business uuid;
  v_display_name text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "name"}';
  end if;
  if p_type = 'independent' and exists (
    select 1 from public.memberships m join public.businesses b on b.id = m.business_id
     where m.user_id = v_user and b.type = 'independent'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_independent"}';
  end if;

  -- Serialise founding offer allocation so the limits cannot be overshot.
  perform pg_advisory_xact_lock(hashtext('founding_offer'));
  select value into v_offer from public.platform_settings where key = 'founding_offer';
  v_limit := coalesce((v_offer ->> case when p_type = 'school' then 'school_limit' else 'instructor_limit' end)::int, 0);
  select count(*) into v_used from public.businesses where founding_offer and type = p_type;
  if v_used < v_limit then
    v_plan := case when p_type = 'school' then 'school'::public.plan_key else 'pro'::public.plan_key end;
  end if;

  insert into public.businesses (type, name, slug, plan, plan_expires_at, founding_offer, created_by, onboarding_completed_at)
  values (
    p_type, v_name, private.unique_slug(v_name, 'businesses'), v_plan,
    case when v_plan <> 'free' then now() + make_interval(months => coalesce((v_offer ->> 'months')::int, 12)) end,
    v_plan <> 'free', v_user,
    case when p_type = 'independent' then now() end
  )
  returning id into v_business;

  insert into public.memberships (business_id, user_id, role) values (v_business, v_user, 'owner');

  if p_type = 'independent' then
    select left(coalesce(nullif(trim(full_name), ''), v_name), 80) into v_display_name from public.users where id = v_user;
    insert into public.instructor_profiles (user_id, business_id, display_name, public_slug)
    values (v_user, v_business, v_display_name, private.unique_slug(v_display_name, 'instructor_profiles'));
  end if;

  update public.users
     set intended_role = case when p_type = 'school' then 'school'::public.intended_role else 'instructor'::public.intended_role end
   where id = v_user;

  perform private.write_audit('business.created', 'business', v_business, v_business, null,
    jsonb_build_object('type', p_type, 'plan', v_plan, 'founding_offer', v_plan <> 'free'));
  return v_business;
end;
$$;

-- A text that may not be a uuid, as one or null, for paths that name a Business.
create or replace function private.uuid_or_null(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function private.uuid_or_null(text) to authenticated;

-- A school's logo sits in the public avatars bucket, in a folder of its own
-- (businesses/<business id>/<name>.webp), written only by those who may change the school's profile.
create policy avatars_insert_business on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'businesses'
    and private.auth_has_permission(private.uuid_or_null((storage.foldername(name))[2]), 'manage_profile')
  );

create policy avatars_update_business on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'businesses'
    and private.auth_has_permission(private.uuid_or_null((storage.foldername(name))[2]), 'manage_profile')
  );

create policy avatars_delete_business on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'businesses'
    and private.auth_has_permission(private.uuid_or_null((storage.foldername(name))[2]), 'manage_profile')
  );

-- ---------------------------------------------------------------------------------------
-- invite_member: one link, for one person, to join a school as an instructor. The role is a
-- parameter so that inviting managers (SCH-02) keeps the same function; for now it is refused.
-- ---------------------------------------------------------------------------------------
create or replace function public.invite_member(
  p_business_id uuid,
  p_role public.membership_role,
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
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- A school has one owner, who signed it up, and nobody is invited to own it; managers are
  -- invited once a school can set what they may do (SCH-02).
  if p_role is distinct from 'instructor' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "role"}';
  end if;
  if p_channel not in ('email', 'sms', 'whatsapp', 'link') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "channel"}';
  end if;

  -- The same allowance as inviting learners: enough for a busy day, not for a script.
  if not private.rate_limit_hit('invite:' || v_user::text, interval '1 hour', 30) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  -- 32 random bytes, in the alphabet a link can carry without escaping.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.invitations (business_id, kind, role, channel, email, phone, full_name, token_hash, invited_by)
  values (
    p_business_id, 'member', p_role, p_channel,
    nullif(btrim(lower(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_full_name, '')), ''),
    private.invitation_hash(v_token),
    v_user
  )
  returning id, invitations.expires_at into v_id, v_expires;

  perform private.write_audit('member.invited', 'invitation', v_id, p_business_id, null,
    jsonb_build_object('role', p_role, 'channel', p_channel));

  -- The only time the token exists outside the link.
  return query select v_id, v_token, v_expires;
end;
$$;

revoke all on function public.invite_member(uuid, public.membership_role, text, text, text, text) from public, anon;
grant execute on function public.invite_member(uuid, public.membership_role, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- invitation_details: now for both kinds of invitation, saying which it is (AUTH-07, AUTH-05).
-- A name and nothing more before anyone signs in, as before. already_member is only ever about
-- the person asking, so an owner who opens the link they made is told it is for somebody else.
-- ---------------------------------------------------------------------------------------
drop function public.invitation_details(text);

create function public.invitation_details(p_token text)
returns table (
  instructor_name text,
  business_name text,
  full_name text,
  email text,
  expired boolean,
  kind text,
  role public.membership_role,
  already_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Never null: a learner invitation names an instructor, and the business stands in for a
  -- member invitation, which names none.
  select coalesce(p.display_name, b.name),
         b.name,
         i.full_name,
         i.email,
         (i.expires_at <= now() or i.accepted_at is not null or i.revoked_at is not null),
         i.kind,
         i.role,
         exists (
           select 1 from public.memberships m
            where m.business_id = i.business_id and m.user_id = (select auth.uid()) and m.status = 'active'
         )
    from public.invitations i
    join public.businesses b on b.id = i.business_id
    left join public.instructor_profiles p on p.id = i.instructor_id
   where i.token_hash = private.invitation_hash(p_token);
$$;

revoke all on function public.invitation_details(text) from public;
grant execute on function public.invitation_details(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- accept_member_invitation: the invited person, now signed in, joins the school.
-- ---------------------------------------------------------------------------------------
create or replace function public.accept_member_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invite public.invitations;
  v_display_name text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_invite from public.invitations
   where token_hash = private.invitation_hash(p_token) and kind = 'member'
   for update;

  if v_invite.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "token", "reason": "expired"}';
  end if;
  -- One account teaches for one Business: the instructor's screens show one diary (D-118).
  if v_invite.role = 'instructor' and exists (
    select 1 from public.instructor_profiles p where p.user_id = v_user and p.business_id <> v_invite.business_id
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "teaches_elsewhere"}';
  end if;

  -- A member already here keeps the role they have; one who had left comes back in the role offered.
  insert into public.memberships (business_id, user_id, role, invited_by)
  values (v_invite.business_id, v_user, v_invite.role, v_invite.invited_by)
  on conflict (business_id, user_id) do update
    set status = 'active', role = excluded.role, invited_by = excluded.invited_by
    where public.memberships.status <> 'active';

  if v_invite.role = 'instructor' then
    select left(coalesce(nullif(btrim(u.full_name), ''), v_invite.full_name, 'Instructor'), 80) into v_display_name
      from public.users u where u.id = v_user;
    insert into public.instructor_profiles (user_id, business_id, display_name, public_slug)
    values (v_user, v_invite.business_id, v_display_name, private.unique_slug(v_display_name, 'instructor_profiles'))
    on conflict (user_id, business_id) do nothing;
  end if;

  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;

  perform private.write_audit('member.invitation_accepted', 'invitation', v_invite.id, v_invite.business_id, null,
    jsonb_build_object('role', v_invite.role, 'user_id', v_user));

  return v_invite.business_id;
end;
$$;

revoke all on function public.accept_member_invitation(text) from public, anon;
grant execute on function public.accept_member_invitation(text) to authenticated;
