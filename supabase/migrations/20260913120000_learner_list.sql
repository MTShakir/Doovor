-- The learner list an instructor works from (LRN-01, LRN-02, M2-04).
--
-- One row per learner in a Business, carrying the few things the list shows and the card
-- will: who they are, how to reach them, where they are up to, and the lessons either side
-- of today. The counts are worked out here so a list of forty learners is one query rather
-- than forty.
--
-- security_invoker: the view is exactly as visible as the tables under it. An instructor
-- sees their own learners, a school sees its own, a learner sees their own row, and nobody
-- sees anybody else's, because that is what the policies on those tables already say.

create view public.learner_list
with (security_invoker = true)
as
select r.id,
       r.business_id,
       r.learner_id,
       r.instructor_id,
       r.status,
       r.source,
       r.usual_duration_minutes,
       r.created_at,
       u.full_name,
       u.phone,
       u.email,
       u.avatar_url,
       lp.transmission,
       lp.postcode,
       i.display_name as instructor_name,
       -- What the search box matches: the name, the email, and the number both as it is
       -- written and as digits, so 07700 900123 finds +447700900123.
       lower(
         coalesce(u.full_name, '') || ' ' || coalesce(u.email, '') || ' ' || coalesce(u.phone, '') || ' ' ||
         regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')
       ) as search_text,
       lessons.next_lesson_at,
       lessons.last_lesson_at,
       coalesce(lessons.lessons_taken, 0)::integer as lessons_taken
  from public.learner_relationships r
  join public.users u on u.id = r.learner_id
  left join public.learner_profiles lp on lp.user_id = r.learner_id
  left join public.instructor_profiles i on i.id = r.instructor_id
  left join lateral (
    select min(b.starts_at) filter (
             where b.starts_at >= now()
               and b.status in ('requested', 'pending_payment', 'confirmed', 'in_progress')
           ) as next_lesson_at,
           max(b.starts_at) filter (where b.status = 'completed') as last_lesson_at,
           count(*) filter (where b.status = 'completed') as lessons_taken
      from public.bookings b
     where b.learner_id = r.learner_id
       and b.business_id = r.business_id
  ) lessons on true
 where u.deleted_at is null;

comment on view public.learner_list is
  'One row per learner in a Business, for the CRM list and card (LRN-01, LRN-02).';

grant select on public.learner_list to authenticated;
