-- Where a lesson starts (COV-04, M1-16).
--
-- The table came with the schema (M0-20). What it was missing is the rule that makes it
-- usable: one default per learner, so a booking screen never has to guess which of three
-- addresses to offer first. Whoever sets a new default takes it off the old one, in the same
-- statement, so there is never a moment with two or none.

create unique index pickup_points_one_default_idx
  on public.pickup_points (learner_id)
  where is_default;

create or replace function private.pickup_points_single_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.pickup_points
       set is_default = false
     where learner_id = new.learner_id
       and id <> new.id
       and is_default;
  end if;
  return new;
end;
$$;

create trigger pickup_points_single_default
  before insert or update of is_default on public.pickup_points
  for each row when (new.is_default) execute function private.pickup_points_single_default();

-- The first address a learner has is their default, whoever added it.
create or replace function private.pickup_points_first_is_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.pickup_points where learner_id = new.learner_id) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

create trigger pickup_points_first_is_default
  before insert on public.pickup_points
  for each row execute function private.pickup_points_first_is_default();
