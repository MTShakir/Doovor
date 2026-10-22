-- A learner moving with their instructor to a full list comes as an enquiry (LRN-07, D-208, D-360).
--
-- A learner saying yes to moving with their instructor, to the instructor's own Business on Free
-- with ten learners already, was refused, and told about a plan that is not theirs; they stayed
-- at the school with nobody to teach them. The limit is for taking on somebody new, and this is
-- somebody the instructor already teaches, so they move. With no room they come as an enquiry,
-- as an invited learner does (D-315), and are counted once there is room.

create or replace function private.settle_learner_move(p_move_id uuid, p_move boolean, p_answered_for boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_move public.learner_moves;
begin
  select * into v_move from public.learner_moves where id = p_move_id;

  if p_move then
    insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, introduced_by, created_by)
    -- Moving with their own instructor is never refused over the Free limit: with no room they
    -- come as an enquiry, as somebody invited does, and their lessons stand (D-208, D-315, D-360).
    values (v_move.to_business_id, v_move.learner_id, v_move.instructor_id,
            case when private.learner_room(v_move.to_business_id) then 'active' else 'enquiry' end::public.learner_status,
            'invite',
            -- Moving back to the school that introduced them, they are its introduction still.
            case when v_move.reason = 'left_school' then v_move.to_business_id end,
            (select auth.uid()))
    on conflict (business_id, learner_id) do nothing;
    -- And they have left the Business they moved from.
    update public.learner_relationships
       set status = 'left'
     where business_id = v_move.from_business_id
       and learner_id = v_move.learner_id
       and status in ('enquiry', 'waiting', 'active', 'test_booked');
  end if;
  update public.learner_moves
     set status = case when p_move then 'moved'::public.learner_move_status else 'stayed'::public.learner_move_status end,
         answered_at = now()
   where id = v_move.id;

  perform private.write_audit(case when p_move then 'learner.moved' else 'learner.stayed' end, 'learner_move', v_move.id,
    v_move.to_business_id, null,
    jsonb_build_object('from', v_move.from_business_id, 'reason', v_move.reason)
      || case when p_answered_for then jsonb_build_object('answered_for_learner', true) else '{}'::jsonb end);
end;
$$;
