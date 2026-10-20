-- A learner who moves leaves the Business they move from (D-292, D-305).
--
-- Answering yes to moving made them a learner where they moved to, and left them a learner of the
-- Business they moved from as well: an instructor who opened their own Business again found the
-- learners who had moved still on it, though its page says it comes back with the learners who
-- stayed. The link there now says they left, as when an instructor marks somebody as left; their
-- lessons, records and anything they paid stay where they were made.

create or replace function public.answer_learner_move(p_move_id uuid, p_move boolean)
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
    v_move.to_business_id, null, jsonb_build_object('from', v_move.from_business_id, 'reason', v_move.reason));
end;
$$;

revoke all on function public.answer_learner_move(uuid, boolean) from public, anon;
grant execute on function public.answer_learner_move(uuid, boolean) to authenticated;

-- Anybody who moved before this is put right the same way.
update public.learner_relationships r
   set status = 'left'
  from public.learner_moves mv
 where mv.status = 'moved'
   and r.business_id = mv.from_business_id
   and r.learner_id = mv.learner_id
   and r.status in ('enquiry', 'waiting', 'active', 'test_booked');
