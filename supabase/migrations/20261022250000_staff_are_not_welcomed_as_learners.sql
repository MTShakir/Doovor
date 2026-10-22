-- Platform staff are not welcomed as learners (NTF-03, D-259, D-370).
--
-- The welcome is said to the side somebody signed up for, and an account with no side said is
-- welcomed as a learner. Staff accounts have none, so a super admin's first notice told them to
-- find an instructor and book their lessons. Staff are not welcomed at all: nothing in it is for
-- them, and the people who make their accounts tell them what they need.

create or replace function public.system_welcome_notice(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'user_id', u.id,
           'full_name', u.full_name,
           'audience', coalesce(u.intended_role::text, 'learner')
         )
    from public.users u
   where u.id = p_user_id
     and u.email_verified_at is not null
     and not exists (select 1 from public.platform_staff s where s.user_id = u.id);
$$;
