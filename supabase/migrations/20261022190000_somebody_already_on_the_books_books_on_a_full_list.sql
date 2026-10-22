-- Somebody already on the books books on a full list (BOK-02, D-208, D-359).
--
-- Booking on the link adds the learner to the Business "on conflict do nothing", so that somebody
-- already with it is left as they are. But the Free limit is a trigger before the insert, and a
-- trigger before an insert runs before the conflict is found: on a full list, every learner the
-- instructor already had was refused the lessons they booked themselves, in words about a plan.
-- The limit is for somebody new, so a row for somebody the Business already has goes through to
-- the conflict, which leaves it alone.

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
  -- Somebody the Business already has is not somebody new: the insert meets its conflict, and
  -- whatever stands there stays as it is (D-359).
  if tg_op = 'INSERT' and exists (
    select 1 from public.learner_relationships r
     where r.business_id = new.business_id and r.learner_id = new.learner_id
  ) then
    return new;
  end if;
  if private.learner_room(new.business_id) then
    return new;
  end if;
  raise exception 'LEARNER_LIMIT';
end;
$$;
