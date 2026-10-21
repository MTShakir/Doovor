-- The learners an instructor's joining asked to move, and an answer for those who cannot give one (M9-23, D-292, D-322).
--
-- Joining a school pauses an instructor's own Business and asks each of its learners whether to
-- move to the school with them. A learner who signs in answers it. A learner the instructor added
-- by hand or imported has an account they have never claimed (D-068), so the question waited for
-- an answer that could never come, and nobody was told: ten of the twelve in the deep test.
--
-- The instructor now sees, for the school they teach under, every learner their own Business
-- asked and how each answered. For a learner who has never signed in, they ask them themselves
-- and say what they chose, as the office does when it adds somebody who agreed on the phone. A
-- learner who has signed in answers for themselves. Either way the move is the one the learner's
-- own answer makes, through one function.

-- ---------------------------------------------------------------------------------------
-- my_learners_asked_to_move: who was asked, and who can answer for themselves.
-- ---------------------------------------------------------------------------------------
create function public.my_learners_asked_to_move()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'moveId', mv.id,
           'learnerName', coalesce(nullif(btrim(u.full_name), ''), 'A learner'),
           'status', mv.status,
           'fromName', f.name,
           'toName', t.name,
           -- Somebody who has never signed in cannot answer here (D-068).
           'canAnswer', exists (select 1 from auth.users a where a.id = mv.learner_id and a.last_sign_in_at is not null)
         ) order by mv.status <> 'asked', u.full_name, mv.id), '[]'::jsonb)
    from public.learner_moves mv
    join public.users u on u.id = mv.learner_id
    join public.businesses f on f.id = mv.from_business_id
    join public.businesses t on t.id = mv.to_business_id
   where mv.reason = 'joined_school'
     and mv.status in ('asked', 'moved', 'stayed')
     and mv.from_business_id in (select private.auth_business_ids(array['owner']::public.membership_role[]))
     and mv.to_business_id in (select private.auth_business_ids(array['instructor']::public.membership_role[]));
$$;

revoke all on function public.my_learners_asked_to_move() from public, anon;
grant execute on function public.my_learners_asked_to_move() to authenticated;

-- ---------------------------------------------------------------------------------------
-- settle_learner_move: what an answer does, whoever gives it. The body of answer_learner_move
-- as 20261020231500_learners_who_move_leave made it, with who answered written down.
-- ---------------------------------------------------------------------------------------
create function private.settle_learner_move(p_move_id uuid, p_move boolean, p_answered_for boolean)
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
    v_move.to_business_id, null,
    jsonb_build_object('from', v_move.from_business_id, 'reason', v_move.reason)
      || case when p_answered_for then jsonb_build_object('answered_for_learner', true) else '{}'::jsonb end);
end;
$$;

revoke all on function private.settle_learner_move(uuid, boolean, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- answer_learner_move: the learner's own answer, as before.
-- ---------------------------------------------------------------------------------------
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

  perform private.settle_learner_move(v_move.id, p_move, false);
end;
$$;

revoke all on function public.answer_learner_move(uuid, boolean) from public, anon;
grant execute on function public.answer_learner_move(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- answer_learner_move_for: the instructor says what a learner who has never signed in chose.
-- ---------------------------------------------------------------------------------------
create function public.answer_learner_move_for(p_move_id uuid, p_move boolean)
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
  -- Only the instructor whose own Business asked them, on joining a school.
  if v_move.id is null
     or v_move.reason <> 'joined_school'
     or not private.auth_has_role(v_move.from_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_move.status <> 'asked' or p_move is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "answered"}';
  end if;
  -- A learner who has signed in answers for themselves.
  if exists (select 1 from auth.users a where a.id = v_move.learner_id and a.last_sign_in_at is not null) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "can_answer"}';
  end if;

  perform private.settle_learner_move(v_move.id, p_move, true);
end;
$$;

revoke all on function public.answer_learner_move_for(uuid, boolean) from public, anon;
grant execute on function public.answer_learner_move_for(uuid, boolean) to authenticated;
