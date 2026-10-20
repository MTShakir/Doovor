-- Linked instructors (M9-05, D-282).
--
-- A school whose instructors sell their own lessons (D-281) does not take them on as members of its
-- own Business. Each keeps their own: their Stripe account, learners, prices, packages and receipts,
-- all theirs, so each is the seller of their own lessons. The school links to that Business: it sends
-- them pupils, sees when they are free, recommends prices and charges them a fee (D-278).
--
-- A Business is linked to one school at a time. While it is, the school vouches for its instructor's
-- badge as it does for its members (D-280), and the Business has Pro, which the school's seat for it
-- pays for (D-279). When the link ends, both go back to what they were.

-- ---------------------------------------------------------------------------------------
-- An invitation to link, beside those to teach under a Business and to learn with one.
-- ---------------------------------------------------------------------------------------
alter table public.invitations drop constraint invitations_kind_check;
alter table public.invitations add constraint invitations_kind_check check (kind in ('member', 'learner', 'link'));

-- ---------------------------------------------------------------------------------------
-- The link itself.
-- ---------------------------------------------------------------------------------------
create type public.school_link_status as enum ('active', 'ended');

create table public.school_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.businesses (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  status public.school_link_status not null default 'active',
  invitation_id uuid references public.invitations (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.users (id) on delete set null,
  end_reason text check (end_reason in ('left', 'let_go')),
  -- What the Business was on before the school gave it Pro, so it goes back to that (D-279).
  pro_given boolean not null default false,
  prior_plan public.plan_key,
  prior_plan_expires_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_links_not_itself check (school_id <> business_id),
  constraint school_links_ended check ((status = 'ended') = (ended_at is not null and end_reason is not null))
);

comment on table public.school_links is
  'A school and an instructor''s own Business it sends pupils to and charges a fee: the instructor sells their own lessons (D-282).';

-- One school at a time for a Business, and a school finds its own quickly.
create unique index school_links_one_school on public.school_links (business_id) where status = 'active';
create index school_links_by_school on public.school_links (school_id) where status = 'active';

create trigger school_links_updated_at
  before update on public.school_links
  for each row execute function private.set_updated_at();

alter table public.school_links enable row level security;

-- The school's owner and managers, and the owner of the Business linked, read it; nobody writes it but
-- the functions below.
create policy school_links_read on public.school_links
  for select to authenticated
  using (
    private.auth_has_role(school_id, array['owner', 'manager']::public.membership_role[])
    or private.auth_has_role(business_id, array['owner']::public.membership_role[])
  );

grant select on public.school_links to authenticated;

-- ---------------------------------------------------------------------------------------
-- The Business an account owns and teaches in on its own: the one it links to a school.
-- ---------------------------------------------------------------------------------------
create function private.own_business_of(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id
    from public.memberships m
    join public.businesses b on b.id = m.business_id and b.type = 'independent'
   where m.user_id = p_user and m.role = 'owner' and m.status = 'active'
   order by m.created_at
   limit 1;
$$;

-- Whether a Business is linked to a school just now.
create function private.is_linked(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.school_links l where l.business_id = p_business_id and l.status = 'active');
$$;

-- ---------------------------------------------------------------------------------------
-- set_lesson_seller: a school with linked instructors does not sell every lesson itself.
-- ---------------------------------------------------------------------------------------
create or replace function public.set_lesson_seller(p_business_id uuid, p_seller public.lesson_seller)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.lesson_seller;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_seller is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "seller"}';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- What the school sells as is the owner's to say, as what it pays is (PRD 6.2).
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select lesson_seller into v_before from public.businesses where id = p_business_id for update;
  if v_before is not distinct from p_seller then
    return;
  end if;

  -- A school whose instructors sell their own lessons has nobody teaching under it: while some
  -- still do, it is both.
  if p_seller = 'instructors' and exists (
    select 1
      from public.memberships m
      join public.instructor_profiles p on p.business_id = m.business_id and p.user_id = m.user_id
     where m.business_id = p_business_id and m.status = 'active'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "seller", "reason": "instructors_teach_here"}';
  end if;
  -- And one that sells every lesson itself has no instructors selling their own (D-282).
  if p_seller = 'school' and exists (
    select 1 from public.school_links l where l.school_id = p_business_id and l.status = 'active'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "seller", "reason": "linked_instructors"}';
  end if;

  update public.businesses set lesson_seller = p_seller where id = p_business_id;

  perform private.write_audit('school.lesson_seller_set', 'business', p_business_id, p_business_id,
    jsonb_build_object('lesson_seller', v_before), jsonb_build_object('lesson_seller', p_seller));
end;
$$;

-- ---------------------------------------------------------------------------------------
-- invite_linked_instructor: a link for an instructor to bring their own Business to the school.
-- ---------------------------------------------------------------------------------------
create function public.invite_linked_instructor(
  p_school_id uuid,
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
  if not exists (select 1 from public.businesses b where b.id = p_school_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_school_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Only a school whose instructors sell their own lessons links them (D-281).
  if not exists (
    select 1 from public.businesses b where b.id = p_school_id and b.lesson_seller in ('instructors', 'both')
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "school_sells"}';
  end if;
  if p_channel not in ('email', 'sms', 'whatsapp', 'link') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "channel"}';
  end if;

  -- The same allowance as every other invitation: enough for a busy day, not for a script.
  if not private.rate_limit_hit('invite:' || v_user::text, interval '1 hour', 30) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  -- 32 random bytes, in the alphabet a link can carry without escaping.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.invitations (business_id, kind, role, channel, email, phone, full_name, token_hash, invited_by)
  values (
    p_school_id, 'link', null, p_channel,
    nullif(btrim(lower(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_full_name, '')), ''),
    private.invitation_hash(v_token),
    v_user
  )
  returning id, invitations.expires_at into v_id, v_expires;

  perform private.write_audit('school.link_invited', 'invitation', v_id, p_school_id, null,
    jsonb_build_object('channel', p_channel));

  -- The only time the token exists outside the link.
  return query select v_id, v_token, v_expires;
end;
$$;

revoke all on function public.invite_linked_instructor(uuid, text, text, text, text) from public, anon;
grant execute on function public.invite_linked_instructor(uuid, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- revoke_member_invitation: an invitation to link is cancelled the same way.
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

  select * into v_invite from public.invitations where id = p_invitation_id and kind in ('member', 'link') for update;
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
  if v_invite.kind = 'link' then
    perform private.write_audit('school.link_invitation_revoked', 'invitation', v_invite.id, v_invite.business_id, null, '{}'::jsonb);
  else
    perform private.write_audit('member.invitation_revoked', 'invitation', v_invite.id, v_invite.business_id, null,
      jsonb_build_object('role', v_invite.role));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- invitation_details: for an invitation to link, whether the person reading it has linked already.
-- ---------------------------------------------------------------------------------------
create or replace function public.invitation_details(p_token text)
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
  -- member's or a link's, which name none.
  select coalesce(p.display_name, b.name),
         b.name,
         i.full_name,
         i.email,
         (i.expires_at <= now() or i.accepted_at is not null or i.revoked_at is not null),
         i.kind,
         i.role,
         case
           when i.kind = 'link' then exists (
             select 1 from public.school_links l
              where l.school_id = i.business_id and l.status = 'active'
                and l.business_id = private.own_business_of((select auth.uid()))
           )
           else exists (
             select 1 from public.memberships m
              where m.business_id = i.business_id and m.user_id = (select auth.uid()) and m.status = 'active'
           )
         end
    from public.invitations i
    join public.businesses b on b.id = i.business_id
    left join public.instructor_profiles p on p.id = i.instructor_id
   where i.token_hash = private.invitation_hash(p_token);
$$;

-- ---------------------------------------------------------------------------------------
-- accept_link_invitation: the instructor, signed in, links their own Business to the school.
-- ---------------------------------------------------------------------------------------
create function public.accept_link_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invite public.invitations;
  v_business uuid;
  v_existing public.school_links;
  v_plan public.plan_key;
  v_expires timestamptz;
  v_pro_given boolean := false;
  v_link uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_invite from public.invitations
   where token_hash = private.invitation_hash(p_token) and kind = 'link'
   for update;
  if v_invite.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "token", "reason": "expired"}';
  end if;

  -- What is linked is the Business they run on their own; somebody without one sets it up first.
  v_business := private.own_business_of(v_user);
  if v_business is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "no_business"}';
  end if;
  -- Somebody who works for the school already is not linked to it as well.
  if exists (
    select 1 from public.memberships m
     where m.business_id = v_invite.business_id and m.user_id = v_user and m.status = 'active'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "member_here"}';
  end if;

  -- One school at a time. Linked to this one already, the link is the one there is.
  select * into v_existing from public.school_links l where l.business_id = v_business and l.status = 'active' for update;
  if v_existing.id is not null then
    if v_existing.school_id <> v_invite.business_id then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "linked_elsewhere"}';
    end if;
    update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;
    return v_existing.id;
  end if;

  -- Pro while linked, which the school's seat pays for (D-279), and what it was before, to go back to.
  select plan, plan_expires_at into v_plan, v_expires from public.businesses where id = v_business for update;
  if v_plan <> 'pro' or v_expires is not null then
    v_pro_given := true;
    update public.businesses set plan = 'pro', plan_expires_at = null where id = v_business;
  end if;

  insert into public.school_links (school_id, business_id, invitation_id, pro_given, prior_plan, prior_plan_expires_at, created_by)
  values (v_invite.business_id, v_business, v_invite.id, v_pro_given,
          case when v_pro_given then v_plan end, case when v_pro_given then v_expires end, v_user)
  returning id into v_link;

  -- The school vouches for the instructor's badge while they are linked, as for its own (D-280).
  update public.instructor_profiles
     set verification_status = 'approved',
         vouched_at = now(),
         badge_path = null,
         verification_decision_reason = null
   where business_id = v_business
     and verification_status in ('unsubmitted', 'pending');

  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_invite.id;

  perform private.write_audit('school.instructor_linked', 'school_link', v_link, v_invite.business_id, null,
    jsonb_build_object('business_id', v_business, 'pro_given', v_pro_given));

  return v_link;
end;
$$;

revoke all on function public.accept_link_invitation(text) from public, anon;
grant execute on function public.accept_link_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- end_school_link: the instructor leaves, or the school lets them go.
-- ---------------------------------------------------------------------------------------
create function public.end_school_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_link public.school_links;
  v_reason text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_link from public.school_links where id = p_link_id for update;
  if v_link.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- The instructor's own to leave, and the school's to end.
  if private.auth_has_role(v_link.business_id, array['owner']::public.membership_role[]) then
    v_reason := 'left';
  elsif private.auth_has_permission(v_link.school_id, 'manage_members') then
    v_reason := 'let_go';
  else
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_link.status = 'ended' then
    return;
  end if;

  update public.school_links
     set status = 'ended', ended_at = now(), ended_by = v_user, end_reason = v_reason
   where id = v_link.id;

  -- The school no longer vouches: a badge it vouched for is the platform's to check again (D-280).
  update public.instructor_profiles
     set verification_status = 'unsubmitted',
         vouched_at = null
   where business_id = v_link.business_id
     and vouched_at is not null;

  -- Pro was the school's to give, so the Business goes back to what it had, unless it now pays for
  -- Pro itself (D-279).
  if v_link.pro_given then
    if exists (
      select 1 from public.subscriptions s
       where s.business_id = v_link.business_id and s.status in ('trialing', 'active', 'past_due')
    ) then
      update public.businesses b
         set plan_expires_at = (select s.current_period_end from public.subscriptions s where s.business_id = b.id)
       where b.id = v_link.business_id;
    else
      update public.businesses
         set plan = coalesce(v_link.prior_plan, 'free'), plan_expires_at = v_link.prior_plan_expires_at
       where id = v_link.business_id;
    end if;
  end if;

  perform private.write_audit('school.link_ended', 'school_link', v_link.id, v_link.school_id,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'ended', 'reason', v_reason, 'business_id', v_link.business_id));
end;
$$;

revoke all on function public.end_school_link(uuid) from public, anon;
grant execute on function public.end_school_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- school_link_of: the school a Business is linked to, for its owner.
-- ---------------------------------------------------------------------------------------
create function public.school_link_of(p_business_id uuid)
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
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
             'linkId', l.id,
             'schoolName', s.name,
             'schoolSlug', s.slug,
             'linkedAt', l.started_at,
             'proGiven', l.pro_given
           )
      from public.school_links l
      join public.businesses s on s.id = l.school_id
     where l.business_id = p_business_id and l.status = 'active'
  );
end;
$$;

revoke all on function public.school_link_of(uuid) from public, anon;
grant execute on function public.school_link_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- school_team: the instructors linked to the school, beside its members, and invitations of
-- both kinds.
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

-- ---------------------------------------------------------------------------------------
-- submit_verification: a linked instructor's badge is vouched for by the school too (D-280).
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
  v_number text := regexp_replace(coalesce(p_badge_number, ''), '\s', '', 'g');
  v_business uuid;
  v_school boolean;
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

  select p.business_id,
         p.badge_path,
         b.type = 'school' or private.is_linked(b.id),
         jsonb_build_object(
           'qualification', p.qualification,
           'badge_number', p.badge_number,
           'verification_status', p.verification_status
         )
    into v_business, v_stored_path, v_school, v_before
    from public.instructor_profiles p
    join public.businesses b on b.id = p.business_id
   where p.id = p_profile_id;

  -- A school vouches for its own instructors, and for those linked to it (D-280): their details are
  -- kept, for the reminders and what a trainee may do, with no photo and nobody on the platform to
  -- look at it.
  if v_school then
    update public.instructor_profiles
       set qualification = p_qualification,
           badge_number = v_number,
           badge_expiry = p_badge_expiry,
           badge_path = null,
           dbs_confirmed_at = now(),
           verification_status = 'approved',
           verification_decision_reason = null,
           vouched_at = coalesce(vouched_at, now())
     where id = p_profile_id;

    perform private.write_audit(
      'instructor.badge_vouched', 'instructor_profile', p_profile_id, v_business, v_before,
      jsonb_build_object('qualification', p_qualification, 'badge_number', v_number, 'verification_status', 'approved')
    );
    return 'approved'::public.verification_status;
  end if;

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
