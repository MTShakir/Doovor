-- What a learner is told when their lesson record is saved (NTF-03, PRD 10.2 step 4, M4-12).
--
-- save_lesson_record raises `lesson_record.added`; the job reads what to say through this, as the
-- service role reads everything it tells anybody, and never touches the tables on anybody's behalf.

/**
 * The learner a saved lesson record is for, who wrote it, which lesson it was and what it says.
 * Null for a record the Business kept for itself, which the learner does not read (D-100), and for
 * a record that is not there.
 */
create or replace function public.system_lesson_record_notice(p_lesson_record_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'lesson_record_id', r.id,
           'business_id', r.business_id,
           'learner_user_id', r.learner_id,
           'learner_name', learner.full_name,
           'instructor_name', instructor.display_name,
           'lesson_starts_at', r.lesson_starts_at,
           'summary', r.summary
         )
    from public.lesson_records r
    join public.users learner on learner.id = r.learner_id
    join public.instructor_profiles instructor on instructor.id = r.instructor_id
   where r.id = p_lesson_record_id
     and r.visibility = 'learner';
$$;

revoke all on function public.system_lesson_record_notice(uuid) from public, anon, authenticated;
grant execute on function public.system_lesson_record_notice(uuid) to service_role;
