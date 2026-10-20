-- Joining a school with a business of one's own, and leaving one (M9-23 to M9-25, D-292).
--
-- An instructor who runs their own Business and joins a school to teach under it pauses that
-- Business: its profile and booking link go offline, and each of its learners is asked whether to
-- move to the school with them. It can only pause with no lessons still to come and no learner
-- holding hours they paid for, because those are owed to learners by that Business (PAY-12).
-- Leaving the school, they open their own Business again. When a linked instructor leaves or is
-- let go, the learners the school introduced are asked whether to move back to the school. Moving
-- is always the learner's choice.

alter table public.businesses
  add column paused_at timestamptz,
  add column paused_for uuid references public.businesses (id) on delete set null;

grant select (paused_at, paused_for) on public.businesses to authenticated;

create type public.learner_move_status as enum ('asked', 'moved', 'stayed', 'withdrawn');

create table public.learner_moves (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.users (id) on delete cascade,
  from_business_id uuid not null references public.businesses (id) on delete cascade,
  to_business_id uuid not null references public.businesses (id) on delete cascade,
  -- Who they would learn with: the instructor who joined the school, or nobody yet, for the school
  -- to choose.
  instructor_id uuid references public.instructor_profiles (id) on delete set null,
  reason text not null check (reason in ('joined_school', 'left_school')),
  status public.learner_move_status not null default 'asked',
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint learner_moves_answered check ((status = 'asked') = (answered_at is null))
);

create unique index learner_moves_one_asked on public.learner_moves (learner_id, from_business_id, to_business_id) where status = 'asked';
create index learner_moves_learner on public.learner_moves (learner_id, status);

comment on table public.learner_moves is
  'A learner asked whether to move to another Business with their instructor, or back to the school that introduced them (D-292).';

alter table public.learner_moves enable row level security;

create policy learner_moves_read on public.learner_moves
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or private.auth_has_role(from_business_id, array['owner', 'manager']::public.membership_role[])
    or private.auth_has_role(to_business_id, array['owner', 'manager']::public.membership_role[])
  );

grant select on public.learner_moves to authenticated;

-- Asks every current learner of one Business, or only those a school introduced, whether to move.
create function private.ask_learners_to_move(
  p_from uuid,
  p_to uuid,
  p_instructor uuid,
  p_reason text,
  p_only_introduced boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.learner_moves (learner_id, from_business_id, to_business_id, instructor_id, reason)
  select r.learner_id, p_from, p_to, p_instructor, p_reason
    from public.learner_relationships r
   where r.business_id = p_from
     and r.status in ('enquiry', 'waiting', 'active', 'test_booked')
     and (not p_only_introduced or r.introduced_by = p_to)
     -- Somebody already a learner where they would move to has nothing to choose.
     and not exists (select 1 from public.learner_relationships here where here.business_id = p_to and here.learner_id = r.learner_id)
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.ask_learners_to_move(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Joining a school: an instructor with a Business of their own pauses it (M9-23).
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
  v_other record;
  v_own uuid;
  v_profile uuid;
  v_link uuid;
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
    select left(coalesce(nullif(btrim(u.full_name), ''), v_invite.full_name, 'Instructor'), 80) into v_display_name
      from public.users u where u.id = v_user;
    insert into public.instructor_profiles (user_id, business_id, display_name, public_slug)
    values (v_user, v_invite.business_id, v_display_name, private.unique_slug(v_display_name, 'instructor_profiles'))
    on conflict (user_id, business_id) do nothing;
    select p.id into v_profile from public.instructor_profiles p where p.user_id = v_user and p.business_id = v_invite.business_id;
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

-- ---------------------------------------------------------------------------------------
-- A linked instructor leaving or let go: the learners the school introduced choose (M9-24).
-- ---------------------------------------------------------------------------------------
create function private.ask_introduced_learners_when_unlinked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ask_learners_to_move(new.business_id, new.school_id, null, 'left_school', true);
  return new;
end;
$$;

create trigger school_links_ask_introduced_learners
  after update of status on public.school_links
  for each row when (new.status = 'ended' and old.status = 'active')
  execute function private.ask_introduced_learners_when_unlinked();

-- ---------------------------------------------------------------------------------------
-- learner_moves_for_me and answer_learner_move: the learner's choice.
-- ---------------------------------------------------------------------------------------
create function public.learner_moves_for_me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'moveId', mv.id,
           'reason', mv.reason,
           'fromName', f.name,
           'toName', t.name,
           'instructorName', p.display_name
         ) order by mv.created_at), '[]'::jsonb)
    from public.learner_moves mv
    join public.businesses f on f.id = mv.from_business_id
    join public.businesses t on t.id = mv.to_business_id
    left join public.instructor_profiles p on p.id = mv.instructor_id
   where mv.learner_id = (select auth.uid()) and mv.status = 'asked';
$$;

revoke all on function public.learner_moves_for_me() from public, anon;
grant execute on function public.learner_moves_for_me() to authenticated;

create function public.answer_learner_move(p_move_id uuid, p_move boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move public.learner_moves;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_move from public.learner_moves where id = p_move_id for update;
  if v_move.id is null or v_move.learner_id <> (select auth.uid()) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_move.status <> 'asked' or p_move is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "answered"}';
  end if;

  if p_move then
    insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, introduced_by, created_by)
    values (v_move.to_business_id, v_move.learner_id, v_move.instructor_id, 'active', 'invite',
            -- Moving back to the school that introduced them, they are its introduction still.
            case when v_move.reason = 'left_school' then v_move.to_business_id end,
            (select auth.uid()))
    on conflict (business_id, learner_id) do nothing;
  end if;
  update public.learner_moves
     set status = case when p_move then 'moved'::public.learner_move_status else 'stayed'::public.learner_move_status end,
         answered_at = now()
   where id = v_move.id;

  perform private.write_audit(case when p_move then 'learner.moved' else 'learner.stayed' end, 'learner_move', v_move.id,
    v_move.to_business_id, null, jsonb_build_object('from', v_move.from_business_id, 'reason', v_move.reason));
end;
$$;

revoke all on function public.answer_learner_move(uuid, boolean) from public, anon;
grant execute on function public.answer_learner_move(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- reopen_own_business: having left the school, the owner opens their own Business again (M9-25).
-- Not while they still teach under another Business.
-- ---------------------------------------------------------------------------------------
create function public.reopen_own_business(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m
      join public.businesses b on b.id = m.business_id
     where m.business_id = p_business_id and m.user_id = v_user and m.role = 'owner' and m.status = 'active'
       and b.status = 'paused'
  ) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.memberships m
      join public.instructor_profiles p on p.business_id = m.business_id and p.user_id = m.user_id
      join public.businesses b on b.id = m.business_id
     where m.user_id = v_user and m.status = 'active' and m.business_id <> p_business_id and b.status <> 'paused'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "teaches_elsewhere"}';
  end if;

  update public.businesses set status = 'active', paused_at = null, paused_for = null where id = p_business_id;
  -- Learners not yet answered have nothing left to choose.
  update public.learner_moves set status = 'withdrawn', answered_at = now()
   where from_business_id = p_business_id and status = 'asked';

  perform private.write_audit('business.reopened', 'business', p_business_id, p_business_id, null, null);
end;
$$;

revoke all on function public.reopen_own_business(uuid) from public, anon;
grant execute on function public.reopen_own_business(uuid) to authenticated;

-- The Business a person owns that is paused, for the screen that offers to open it again.
create function public.my_paused_business()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('businessId', b.id, 'name', b.name, 'pausedFor', s.name)
    from public.memberships m
    join public.businesses b on b.id = m.business_id and b.status = 'paused'
    left join public.businesses s on s.id = b.paused_for
   where m.user_id = (select auth.uid()) and m.role = 'owner' and m.status = 'active'
   limit 1;
$$;

revoke all on function public.my_paused_business() from public, anon;
grant execute on function public.my_paused_business() to authenticated;
