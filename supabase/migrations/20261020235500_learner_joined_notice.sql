-- Telling an instructor, and their school, that a learner accepted their invitation (NTF-03, D-297).
--
-- Appendix B's "New learner invite accepted" has been in the notice catalogue from the start, as
-- `learner.joined`, but nothing sent it. Accepting stamps the invitation, so a trigger on that
-- stamp queues one event with the invitation's id, and the job reads who to tell through
-- `system_learner_joined_notice`, as for a school's own notices (D-295).

create function private.queue_learner_joined()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_event('learner.joined', jsonb_build_object('invitation_id', new.id));
  return null;
end;
$$;

revoke all on function private.queue_learner_joined() from public, anon, authenticated;

create trigger invitations_learner_joined_notice
  after update of accepted_at on public.invitations
  for each row when (new.kind = 'learner' and old.accepted_at is null and new.accepted_at is not null)
  execute function private.queue_learner_joined();

/**
 * Who to tell that a learner accepted an invitation, and about whom: the instructor it named, or
 * the one the learner has now, while they still teach there, and a school's owner and managers; at
 * a Business of one, its owner. Null once the invitation or the learner's account is gone.
 */
create function public.system_learner_joined_notice(p_invitation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.invitations;
  v_learner public.users;
  v_business public.businesses;
  v_instructor public.instructor_profiles;
begin
  select * into v_invite
    from public.invitations
   where id = p_invitation_id and kind = 'learner' and accepted_at is not null;
  if v_invite.id is null then
    return null;
  end if;
  select * into v_learner from public.users where id = v_invite.accepted_by and deleted_at is null;
  select * into v_business from public.businesses where id = v_invite.business_id;
  if v_learner.id is null or v_business.id is null then
    return null;
  end if;
  select * into v_instructor
    from public.instructor_profiles p
   where p.business_id = v_business.id
     and p.id = coalesce(
           v_invite.instructor_id,
           (select r.instructor_id from public.learner_relationships r
             where r.business_id = v_business.id and r.learner_id = v_learner.id)
         );

  return jsonb_build_object(
    'invitation_id', v_invite.id,
    'business_id', v_business.id,
    'learner_id', v_learner.id,
    'learner_name', v_learner.full_name,
    'instructor_name', v_instructor.display_name,
    'recipients', case
      when v_business.type = 'school' then
        coalesce((
          select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'audience', 'instructor'))
            from public.memberships m
            join public.users u on u.id = m.user_id and u.deleted_at is null
           where m.business_id = v_business.id and m.user_id = v_instructor.user_id and m.status = 'active'
        ), '[]'::jsonb)
        || private.school_notice_people(v_business.id, array['owner', 'manager']::public.membership_role[], 'school')
      else private.school_notice_people(v_business.id, array['owner']::public.membership_role[], 'instructor')
    end
  );
end;
$$;

revoke all on function public.system_learner_joined_notice(uuid) from public, anon, authenticated;
grant execute on function public.system_learner_joined_notice(uuid) to service_role;
