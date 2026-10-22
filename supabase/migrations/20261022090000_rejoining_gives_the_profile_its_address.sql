-- Somebody a school switched off who comes back by a new link keeps the profile they had there
-- (D-324), and now gets its public address back with it, as switching them back on gives it
-- (D-120, D-334). Without it their profile and booking link stayed off the site.
--
-- accept_member_invitation is otherwise as 20261021180000_joining_carries_the_profile_over made it.

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
  v_other record;
  v_own uuid;
  v_profile uuid;
  v_link uuid;
  v_source public.instructor_profiles;
  v_made uuid;
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

  -- One account teaches for one Business at a time (D-118). A Business of their own pauses while
  -- they teach under the school (D-292); teaching for anybody else's, they cannot join.
  if v_invite.role = 'instructor' then
    for v_other in
      select p.business_id, b.type, b.status, (m.role = 'owner' and m.status = 'active') as owns
        from public.instructor_profiles p
        join public.businesses b on b.id = p.business_id
        left join public.memberships m on m.business_id = p.business_id and m.user_id = v_user
       where p.user_id = v_user and p.business_id <> v_invite.business_id
    loop
      continue when v_other.status = 'paused';
      if v_other.type <> 'independent' or not coalesce(v_other.owns, false) then
        raise exception 'VALIDATION_FAILED' using detail = '{"reason": "teaches_elsewhere"}';
      end if;
      if exists (
        select 1 from public.bookings bk
         where bk.business_id = v_other.business_id
           and bk.status in ('pending_payment', 'requested', 'confirmed', 'in_progress')
           and bk.ends_at > now()
      ) then
        raise exception 'VALIDATION_FAILED' using detail = '{"reason": "lessons_to_come"}';
      end if;
      if exists (
        select 1 from public.credit_lots c
         where c.business_id = v_other.business_id
           and c.minutes_remaining > 0
           and (c.expires_at is null or c.expires_at > now())
      ) then
        raise exception 'VALIDATION_FAILED' using detail = '{"reason": "credit_left"}';
      end if;
      v_own := v_other.business_id;
    end loop;
  end if;

  -- A member already here keeps the role they have; one who had left comes back in the role offered.
  insert into public.memberships (business_id, user_id, role, invited_by)
  values (v_invite.business_id, v_user, v_invite.role, v_invite.invited_by)
  on conflict (business_id, user_id) do update
    set status = 'active', role = excluded.role, invited_by = excluded.invited_by
    where public.memberships.status <> 'active';

  if v_invite.role = 'instructor' then
    -- The profile of a Business of their own, paused or not, which the new one starts from (D-324).
    select p.* into v_source
      from public.instructor_profiles p
      join public.businesses b on b.id = p.business_id and b.type = 'independent'
      join public.memberships m on m.business_id = p.business_id and m.user_id = v_user and m.role = 'owner'
     where p.user_id = v_user
       and p.business_id <> v_invite.business_id
     order by p.updated_at desc
     limit 1;

    select left(coalesce(nullif(btrim(v_source.display_name), ''), nullif(btrim(u.full_name), ''), v_invite.full_name, 'Instructor'), 80)
      into v_display_name
      from public.users u where u.id = v_user;
    insert into public.instructor_profiles (user_id, business_id, display_name, public_slug)
    values (v_user, v_invite.business_id, v_display_name, private.unique_slug(v_display_name, 'instructor_profiles'))
    on conflict (user_id, business_id) do nothing
    returning id into v_made;
    select p.id into v_profile from public.instructor_profiles p where p.user_id = v_user and p.business_id = v_invite.business_id;
    -- Coming back to a school that switched them off, by a new link, the profile they had here gets a
    -- public address made from their name again, as switching them back on gives it (D-120, D-334).
    update public.instructor_profiles p
       set public_slug = private.unique_slug(p.display_name, 'instructor_profiles')
     where p.id = v_profile and p.public_slug is null;

    -- A new profile carries over what they already set up, so nobody types it all again: who they
    -- are, their car, where they teach, their badge and their hours. One who finished setting up
    -- their own is set up here too; one part way through carries on where they were, and the
    -- prices are the school's. The photo is copied by the app, as a picture of its own. Coming
    -- back to a school they left, they keep the profile they had there.
    if v_made is not null and v_source.id is not null then
      update public.instructor_profiles p
         set bio = v_source.bio,
             languages = v_source.languages,
             years_teaching = v_source.years_teaching,
             qualification = v_source.qualification,
             badge_number = v_source.badge_number,
             badge_expiry = v_source.badge_expiry,
             dbs_confirmed_at = v_source.dbs_confirmed_at,
             transmission = v_source.transmission,
             car_make = v_source.car_make,
             car_model = v_source.car_model,
             dual_controls = v_source.dual_controls,
             specialisms = v_source.specialisms,
             radius_miles = v_source.radius_miles,
             base_postcode = v_source.base_postcode,
             base_location = v_source.base_location,
             onboarding_step = case
               when v_source.onboarding_completed_at is not null then 5
               -- Their own prices were the step after the area; at a school, the hours are.
               when v_source.onboarding_step = 4 then 5
               else v_source.onboarding_step
             end,
             onboarding_completed_at = case when v_source.onboarding_completed_at is not null then now() end
       where p.id = v_made;

      insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
      select v_made, v_invite.business_id, h.weekday, h.start_time, h.end_time
        from public.working_hours h
       where h.instructor_id = v_source.id;
    end if;
  end if;

  if v_own is not null then
    -- Its learners are asked first, so those the school introduced to it can follow them too.
    perform private.ask_learners_to_move(v_own, v_invite.business_id, v_profile, 'joined_school', false);
    -- It teaches under one school now, so a school it was linked to stops sending it pupils, the
    -- way leaving always ends a link: the badge check and the plan go back (D-282).
    for v_link in select l.id from public.school_links l where l.business_id = v_own and l.status = 'active' loop
      perform public.end_school_link(v_link);
    end loop;
    update public.businesses
       set status = 'paused', paused_at = now(), paused_for = v_invite.business_id
     where id = v_own;
    perform private.write_audit('business.paused', 'business', v_own, v_own, null,
      jsonb_build_object('for', v_invite.business_id));
  end if;

  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;

  perform private.write_audit('member.invitation_accepted', 'invitation', v_invite.id, v_invite.business_id, null,
    jsonb_build_object('role', v_invite.role, 'user_id', v_user));

  return v_invite.business_id;
end;
$$;
