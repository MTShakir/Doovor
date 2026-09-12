-- Nobody learns to drive before sixteen (AUTH-06, M2-01).
--
-- The rule depends on today's date, so it cannot be a check constraint: a constraint is
-- checked again whenever a row is rewritten, and a learner who was sixteen when they signed
-- up must not become invalid on a later edit. A trigger on the write is the right shape, and
-- it holds whatever writes the row.

create or replace function private.learner_private_min_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_of_birth is not null
     and new.date_of_birth > (current_date - interval '16 years')::date then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dateOfBirth"}';
  end if;
  return new;
end;
$$;

create trigger learner_private_min_age
  before insert or update of date_of_birth on public.learner_private
  for each row execute function private.learner_private_min_age();
