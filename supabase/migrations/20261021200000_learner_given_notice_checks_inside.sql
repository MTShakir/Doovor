-- The notice of a learner given to an instructor decides inside its own function (NTF-03, D-325).
--
-- 20261021190000 decided in each trigger's condition whether the office had given the learner,
-- calling private.given_by_the_office there. A trigger's condition is checked as whoever writes the
-- row, so a write by a role that may not call private functions, the service role for one, was
-- refused outright, for the sake of a notice. Nothing writes learner links that way today; the next
-- job that did would have failed. The check now happens inside the trigger's own function, which
-- runs as its owner, as every other trigger here does.

drop trigger if exists learner_relationships_given_notice on public.learner_relationships;
drop trigger if exists learner_relationships_given_again_notice on public.learner_relationships;

create function private.queue_learner_given()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.instructor_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if new.instructor_id is not distinct from old.instructor_id then
      return null;
    end if;
  end if;
  if private.given_by_the_office(new.business_id, new.instructor_id) then
    perform private.enqueue_event('school.notice', jsonb_build_object('kind', 'learner.assigned', 'id', new.id));
  end if;
  return null;
end;
$$;

revoke all on function private.queue_learner_given() from public, anon, authenticated;

create trigger learner_relationships_given_notice
  after insert or update of instructor_id on public.learner_relationships
  for each row execute function private.queue_learner_given();
