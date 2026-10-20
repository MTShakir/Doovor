-- A learner accepting an invitation is news to the instructor who sent it (NTF-03, LRN-03, PRD
-- Appendix B "New learner invite accepted", D-301).
--
-- The notice was in the catalogue, with its words, and nothing sent it: accepting an invitation
-- linked the learner and told nobody, so an instructor found out by looking. accept_invitation now
-- queues `learner.joined` with the invitation, as every write here queues what it did (D-017), and
-- the job reads who to tell through system_learner_joined_notice, as the service role reads
-- everything it tells anybody.
--
-- accept_invitation is the function from 20260913110000, with the event added.

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

  -- The instructor who sent it hears, and their school. Which invitation, and nothing about who.
  perform private.enqueue_event('learner.joined', jsonb_build_object('invitation_id', v_invite.id));

  return v_invite.business_id;
end;
$$;

/**
 * Who to tell that an invitation was accepted, and what to say: the learner by the name they gave
 * themselves (or the one on the invitation, if they gave none), the instructor they are now with,
 * and the owners and managers of the school that instructor teaches for, who hear as well. An
 * independent instructor's own Business has nobody else to tell. Null for an invitation that is
 * gone, was never accepted, or whose learner has gone since.
 */
create or replace function public.system_learner_joined_notice(p_invitation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'invitation_id', i.id,
           'business_id', i.business_id,
           'learner_user_id', u.id,
           'learner_name', coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(i.full_name), '')),
           'instructor_user_id', p.user_id,
           'instructor_name', p.display_name,
           'school_staff_ids', coalesce((
             select jsonb_agg(m.user_id order by m.created_at)
               from public.memberships m
               join public.businesses b on b.id = m.business_id
              where m.business_id = i.business_id
                and b.type = 'school'
                and m.role in ('owner', 'manager')
                and m.status = 'active'
                and m.user_id is distinct from p.user_id
           ), '[]'::jsonb)
         )
    from public.invitations i
    join public.users u on u.id = i.accepted_by
    left join public.instructor_profiles p on p.id = i.instructor_id
   where i.id = p_invitation_id
     and i.kind = 'learner'
     and i.accepted_at is not null;
$$;

revoke all on function public.system_learner_joined_notice(uuid) from public, anon, authenticated;
grant execute on function public.system_learner_joined_notice(uuid) to service_role;
