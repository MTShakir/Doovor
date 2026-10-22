-- A school supervises its trainees from its team, and only a school can (INS-04, R-18, D-342).
--
-- Supervision was the school's to give through set_supervisor (D-061), but no screen gave it, so a
-- trainee who joined a school could never be booked. The team now says who is a trainee and
-- whether the school supervises them, and the member's sheet switches it.
--
-- set_supervisor asked only for permission to manage the Business's members, which a trainee
-- running a business of their own has: they could have supervised themselves. It now takes a
-- school, and somebody other than the trainee.

create or replace function public.set_supervisor(p_instructor_id uuid, p_supervised boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_qualification public.instructor_qualification;
  v_trainee uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select p.business_id, p.qualification, p.user_id into v_business, v_qualification, v_trainee
    from public.instructor_profiles p where p.id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- A school answers for the trainees who teach for it. A trainee who runs a business of their
  -- own can manage its members, and would otherwise be supervising themselves (R-18, D-342).
  if not exists (select 1 from public.businesses b where b.id = v_business and b.type = 'school')
     or v_trainee = v_user
     or not private.auth_has_permission(v_business, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_qualification <> 'pdi' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "qualification"}';
  end if;

  update public.instructor_profiles
     set supervisor_business_id = case when p_supervised then v_business end
   where id = p_instructor_id;

  perform private.write_audit(
    'instructor.supervision_changed', 'instructor_profile', p_instructor_id, v_business, null,
    jsonb_build_object('supervised', p_supervised)
  );
  return p_supervised;
end;
$$;

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
               -- A trainee teaches only while somebody supervises them, here the school (R-18, D-342).
               'qualification', p.qualification,
               'supervised', coalesce(p.supervisor_business_id = p_business_id, false),
               'set_own_prices', coalesce(m.permissions -> 'set_own_prices' = 'true'::jsonb, false),
               'view_revenue', coalesce(m.permissions -> 'view_revenue' = 'true'::jsonb, false),
               'lessons_to_come', (
                 select count(*)::integer
                   from public.bookings b
                  where b.instructor_id = p.id
                    and b.status in ('pending_payment', 'requested', 'confirmed')
                    and b.starts_at > now()
               ),
               -- The learners they teach there, who stay theirs when they are switched off (D-317).
               'learners', (
                 select count(*)::integer
                   from public.learner_relationships r
                  where r.business_id = p_business_id
                    and r.instructor_id = p.id
                    and r.status in ('enquiry', 'waiting', 'active', 'test_booked')
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
    -- Instructors who sell their own lessons, by the Business they run (D-282). Their money and
    -- their learners stay theirs: the school sees who they are and how to reach them.
    'linked', coalesce((
      select jsonb_agg(jsonb_build_object(
               'link_id', l.id,
               'business_id', l.business_id,
               'business_name', b.name,
               'name', coalesce(nullif(btrim(p.display_name), ''), b.name),
               'email', u.email,
               'phone', u.phone,
               'instructor_id', p.id,
               'photo_path', p.photo_path,
               'qualification', p.qualification,
               'badge_expiry', p.badge_expiry,
               'linked_at', l.started_at
             ) order by coalesce(p.display_name, b.name), l.id)
        from public.school_links l
        join public.businesses b on b.id = l.business_id
        left join public.memberships owner on owner.business_id = l.business_id and owner.role = 'owner' and owner.status = 'active'
        left join public.users u on u.id = owner.user_id
        left join public.instructor_profiles p on p.business_id = l.business_id and p.user_id = owner.user_id
       where l.school_id = p_business_id
         and l.status = 'active'
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invitation_id', i.id,
               'kind', i.kind,
               'role', i.role,
               'full_name', i.full_name,
               'email', i.email,
               'phone', i.phone,
               'expires_at', i.expires_at
             ) order by i.created_at desc)
        from public.invitations i
       where i.business_id = p_business_id
         and i.kind in ('member', 'link')
         and i.accepted_at is null
         and i.revoked_at is null
         and i.expires_at > now()
    ), '[]'::jsonb)
  );
end;
$$;
