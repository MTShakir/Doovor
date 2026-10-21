-- Switching somebody back on whose own Business is paused (D-292, D-312).
--
-- An instructor with a Business of their own pauses it to teach under a school. Switched off by
-- the school and then back on before opening their own again, they were refused with "They teach
-- for another driving business now": the check counted their own paused Business as teaching
-- elsewhere. A paused Business teaches nobody, as joining already knows (20261020190300), so it no
-- longer counts here either. Once they open it again, they do teach elsewhere, and stay off.
--
-- public.set_member_active is the function from 20260916130000, with the paused Business left out.

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
    -- Their own Business, paused while they teach here, is not elsewhere (D-292, D-312).
    if exists (select 1 from public.instructor_profiles p where p.business_id = v_member.business_id and p.user_id = v_member.user_id)
       and exists (
         select 1
           from public.instructor_profiles p
           join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
           join public.businesses b on b.id = p.business_id and b.status <> 'paused'
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
