-- Free carries ten learners at a time, not everybody (D-208).
--
-- Free was unlimited, which left nothing between it and Pro for an instructor whose business is
-- working: the plan that costs nothing did the whole job. Ten is enough to run a real week and
-- few enough that somebody making a living from it has outgrown it.
--
-- What is counted is the learners somebody is teaching or lined up to teach: active, waiting and
-- test booked. An enquiry that went nowhere, somebody who has passed and somebody who has left
-- are not counted, because none of them is work and none of them should cost anybody a plan.
--
-- Nobody loses a learner they already have. The limit refuses the next one, and an instructor
-- already over it keeps every one of them and simply cannot add another until they are under it
-- again or on Pro. Taking away somebody's learners to sell them a plan is not a thing we do.

insert into public.platform_settings (key, value, description) values
  ('free_plan_limits', '{"active_learners": 10}',
   'What the Free plan carries: learners on the books at once, counting active, waiting and test booked (D-208)')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------
-- learners_on_books: how many a Business is carrying.
-- ---------------------------------------------------------------------------------------
create or replace function private.learners_on_books(p_business_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.learner_relationships r
   where r.business_id = p_business_id
     and r.status in ('active', 'waiting', 'test_booked');
$$;

revoke all on function private.learners_on_books(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- learner_room: whether one more will fit.
--
-- Only Free is limited. A Business whose plan has run out is still on that plan until something
-- takes it away, and nothing does yet (D-204), so this reads the plan as it stands.
-- ---------------------------------------------------------------------------------------
create or replace function private.learner_room(p_business_id uuid)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_plan public.plan_key;
  v_limit integer;
begin
  select b.plan into v_plan from public.businesses b where b.id = p_business_id;
  if v_plan is null or v_plan <> 'free' then
    return true;
  end if;

  select (s.value ->> 'active_learners')::integer into v_limit
    from public.platform_settings s where s.key = 'free_plan_limits';
  if v_limit is null or v_limit <= 0 then
    return true;
  end if;

  return private.learners_on_books(p_business_id) < v_limit;
end;
$$;

revoke all on function private.learner_room(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- plan_learner_room: what the screens ask, so a number can be shown before anybody is refused.
-- ---------------------------------------------------------------------------------------
create or replace function public.learner_allowance(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plan_key;
  v_limit integer;
begin
  if not private.auth_is_member(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select b.plan into v_plan from public.businesses b where b.id = p_business_id;
  select (s.value ->> 'active_learners')::integer into v_limit
    from public.platform_settings s where s.key = 'free_plan_limits';

  return jsonb_build_object(
    'on_books', private.learners_on_books(p_business_id),
    -- Null is no limit at all, which is every plan but Free.
    'limit', case when v_plan = 'free' and coalesce(v_limit, 0) > 0 then v_limit end
  );
end;
$$;

revoke all on function public.learner_allowance(uuid) from public, anon;
grant execute on function public.learner_allowance(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- The limit itself, as a trigger rather than a line in each of the three functions that take a
-- learner on (add_learner, accept_invitation, create_booking). A rule copied into three places is
-- a rule that will disagree with itself, and the fourth way in, whenever it is written, would
-- have missed it altogether.
--
-- Insert is somebody new. Update is somebody coming back onto the books from passed or left, which
-- is the same thing as far as a limit is concerned: without it, marking one as passed and the next
-- one as active would walk straight round the number.
-- ---------------------------------------------------------------------------------------
create or replace function private.check_learner_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_counted constant public.learner_status[] := array['active', 'waiting', 'test_booked'];
begin
  if not (new.status = any (v_counted)) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = any (v_counted) then
    return new;
  end if;
  if private.learner_room(new.business_id) then
    return new;
  end if;
  raise exception 'LEARNER_LIMIT';
end;
$$;

create trigger learner_relationships_room
  before insert or update of status on public.learner_relationships
  for each row execute function private.check_learner_room();
