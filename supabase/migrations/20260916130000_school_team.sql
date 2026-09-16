-- A school's team (SCH-02, M5-13).
--
-- The owner and managers see everybody who teaches for the school or helps run it, invite
-- instructors, cancel an invitation sent to the wrong person, switch a member off and on again,
-- and say what each may do: whether an instructor sets their own prices, and whether a manager
-- sees the school's revenue (PRD 6.2). A member switched off loses the school at once, because
-- every access check already asks for an active membership; they also lose their public address,
-- so their profile and booking link stop taking learners, and nobody can book them a new lesson.
-- Lessons already booked stay in the school's diary to be given to somebody else (D-120).

-- ---------------------------------------------------------------------------------------
-- The slot check refuses an instructor who has left the Business, whoever is booking.
-- Otherwise as before (M2-23).
-- ---------------------------------------------------------------------------------------
create or replace function private.slot_problem(
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_by text default 'learner',
  p_learner_id uuid default null,
  p_now timestamptz default now(),
  p_except_booking_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb := private.booking_rules(p_instructor_id);
  v_buffer integer := coalesce((v_rules ->> 'buffer_minutes')::int, 30);
  v_notice integer := coalesce((v_rules ->> 'notice_hours')::int, 24);
  v_horizon integer := coalesce((v_rules ->> 'horizon_weeks')::int, 8);
  v_ends_at timestamptz := p_starts_at + make_interval(mins => p_duration_minutes);
  v_blocked tstzrange := tstzrange(p_starts_at, v_ends_at + make_interval(mins => v_buffer), '[)');
  v_lesson tstzrange := tstzrange(p_starts_at, v_ends_at, '[)');
begin
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    return 'VALIDATION_FAILED';
  end if;

  -- Somebody switched off at their Business teaches nobody there (SCH-02, D-120).
  if not exists (
    select 1
      from public.instructor_profiles i
      join public.memberships m on m.business_id = i.business_id and m.user_id = i.user_id and m.status = 'active'
     where i.id = p_instructor_id
  ) then
    return 'INSTRUCTOR_INACTIVE';
  end if;

  if exists (
    select 1 from public.bookings b
     where b.instructor_id = p_instructor_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.blocked_range && v_blocked
       and (p_except_booking_id is null or b.id <> p_except_booking_id)
  ) then
    return 'SLOT_TAKEN';
  end if;

  if p_learner_id is not null and exists (
    select 1 from public.bookings b
     where b.learner_id = p_learner_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.learner_range && v_lesson
       and (p_except_booking_id is null or b.id <> p_except_booking_id)
  ) then
    return 'LEARNER_BUSY';
  end if;

  -- An instructor books what they like in their own diary, as long as it is free (R-04).
  if p_by = 'instructor' then
    return null;
  end if;

  if p_starts_at < p_now + make_interval(hours => v_notice) then
    return 'NOTICE_TOO_SHORT';
  end if;
  if p_starts_at > p_now + make_interval(weeks => v_horizon) then
    return 'BEYOND_HORIZON';
  end if;
  if not private.is_open(p_instructor_id, p_starts_at, v_ends_at) then
    return 'OUTSIDE_AVAILABILITY';
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- school_team: everybody at a school but its owner, for the people who run it.
-- ---------------------------------------------------------------------------------------
create or replace function public.school_team(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'membership_id', m.id,
               'is_you', m.user_id = (select auth.uid()),
               'role', m.role,
               'active', m.status = 'active',
               'name', coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(u.full_name), ''), u.email),
               'email', u.email,
               'phone', u.phone,
               'instructor_id', p.id,
               'photo_path', p.photo_path,
               'set_own_prices', coalesce(m.permissions -> 'set_own_prices' = 'true'::jsonb, false),
               'view_revenue', coalesce(m.permissions -> 'view_revenue' = 'true'::jsonb, false),
               'lessons_to_come', (
                 select count(*)::integer
                   from public.bookings b
                  where b.instructor_id = p.id
                    and b.status in ('pending_payment', 'requested', 'confirmed')
                    and b.starts_at > now()
               ),
               'joined_at', m.created_at
             ) order by m.status = 'active' desc, m.role, coalesce(p.display_name, u.full_name), m.id)
        from public.memberships m
        join public.users u on u.id = m.user_id
        left join public.instructor_profiles p on p.business_id = m.business_id and p.user_id = m.user_id
       where m.business_id = p_business_id
         and m.role <> 'owner'
         and m.status in ('active', 'deactivated')
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invitation_id', i.id,
               'role', i.role,
               'full_name', i.full_name,
               'email', i.email,
               'phone', i.phone,
               'expires_at', i.expires_at
             ) order by i.created_at desc)
        from public.invitations i
       where i.business_id = p_business_id
         and i.kind = 'member'
         and i.accepted_at is null
         and i.revoked_at is null
         and i.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.school_team(uuid) from public, anon;
grant execute on function public.school_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- set_member_active: switch somebody at a school off, or back on.
-- ---------------------------------------------------------------------------------------
create or replace function public.set_member_active(p_membership_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_member public.memberships;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_active is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "active"}';
  end if;

  select m.* into v_member
    from public.memberships m
    join public.businesses b on b.id = m.business_id and b.type = 'school'
   where m.id = p_membership_id
     for update of m;
  if v_member.id is null or not private.auth_has_permission(v_member.business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- The owner stays; nobody switches themselves off; managers are the owner's to switch.
  if v_member.role = 'owner' or v_member.user_id = v_user then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_this_member"}';
  end if;
  if v_member.role = 'manager' and not private.auth_has_role(v_member.business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_member.status not in ('active', 'deactivated') or (v_member.status = 'active') = p_active then
    return;
  end if;

  if p_active then
    -- One account, one diary (D-118): somebody who has since started teaching elsewhere stays off.
    if exists (select 1 from public.instructor_profiles p where p.business_id = v_member.business_id and p.user_id = v_member.user_id)
       and exists (
         select 1
           from public.instructor_profiles p
           join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
          where p.user_id = v_member.user_id and p.business_id <> v_member.business_id
       ) then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "teaches_elsewhere"}';
    end if;
    update public.memberships set status = 'active' where id = v_member.id;
    -- Back on, with a public address made from their name again.
    update public.instructor_profiles p
       set public_slug = private.unique_slug(p.display_name, 'instructor_profiles')
     where p.business_id = v_member.business_id and p.user_id = v_member.user_id and p.public_slug is null;
  else
    update public.memberships set status = 'deactivated' where id = v_member.id;
    update public.instructor_profiles p
       set public_slug = null
     where p.business_id = v_member.business_id and p.user_id = v_member.user_id;
  end if;
end;
$$;

revoke all on function public.set_member_active(uuid, boolean) from public, anon;
grant execute on function public.set_member_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- set_member_permission: what one member may do, beyond their role (PRD 6.2).
--   set_own_prices: an instructor sets their own prices rather than teaching at the school's.
--   view_revenue:   a manager sees the school's revenue. Only the owner decides that.
-- ---------------------------------------------------------------------------------------
create or replace function public.set_member_permission(p_membership_id uuid, p_permission text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_member public.memberships;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_allowed is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "allowed"}';
  end if;

  select m.* into v_member
    from public.memberships m
    join public.businesses b on b.id = m.business_id and b.type = 'school'
   where m.id = p_membership_id
     for update of m;
  if v_member.id is null or not private.auth_has_permission(v_member.business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_member.user_id = v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not ((p_permission = 'set_own_prices' and v_member.role = 'instructor')
          or (p_permission = 'view_revenue' and v_member.role = 'manager')) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "permission"}';
  end if;
  if p_permission = 'view_revenue' and not private.auth_has_role(v_member.business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.memberships
     set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(p_permission, p_allowed)
   where id = v_member.id;
end;
$$;

revoke all on function public.set_member_permission(uuid, text, boolean) from public, anon;
grant execute on function public.set_member_permission(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- revoke_member_invitation: a link sent to the wrong person stops working at once.
-- ---------------------------------------------------------------------------------------
create or replace function public.revoke_member_invitation(p_invitation_id uuid)
returns void
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

  select * into v_invite from public.invitations where id = p_invitation_id and kind = 'member' for update;
  if v_invite.id is null or not private.auth_has_permission(v_invite.business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_accepted"}';
  end if;
  if v_invite.revoked_at is not null then
    return;
  end if;

  update public.invitations set revoked_at = now() where id = v_invite.id;
  perform private.write_audit('member.invitation_revoked', 'invitation', v_invite.id, v_invite.business_id, null,
    jsonb_build_object('role', v_invite.role));
end;
$$;

revoke all on function public.revoke_member_invitation(uuid) from public, anon;
grant execute on function public.revoke_member_invitation(uuid) to authenticated;
