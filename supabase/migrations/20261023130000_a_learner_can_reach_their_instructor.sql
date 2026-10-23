-- A learner can reach their own instructor from the app (BOK-08, LRN-02, D-386).
--
-- Only the instructor moves a lesson, and the learner was told to "contact them directly" to ask,
-- with no way to: the app showed the instructor's name and nothing to reach them by. The product
-- owner decided their own learners see their instructor's mobile, to call, text or WhatsApp. It
-- is the number the instructor verified for their account, which the screen that verified it
-- already says learners use to reach them.
--
-- Whose: an instructor who teaches them, at a Business they are with and have not left; the
-- instructor they are with, or one they have a lesson with, as a cover lesson is. Nobody else's,
-- and only a number that was verified.

create or replace function public.my_instructors_contact()
returns table (instructor_id uuid, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, u.phone
    from public.instructor_profiles p
    join public.users u on u.id = p.user_id
   where u.phone is not null
     and u.phone_verified_at is not null
     and exists (
       select 1
         from public.learner_relationships r
        where r.learner_id = (select auth.uid())
          and r.business_id = p.business_id
          and r.status <> 'left'
          and (
            r.instructor_id = p.id
            or exists (
              select 1 from public.bookings b
               where b.learner_id = r.learner_id
                 and b.business_id = r.business_id
                 and b.instructor_id = p.id
            )
          )
     );
$$;

revoke all on function public.my_instructors_contact() from public, anon;
grant execute on function public.my_instructors_contact() to authenticated;
