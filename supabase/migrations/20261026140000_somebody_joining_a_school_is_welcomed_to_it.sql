-- Somebody who joins a school is welcomed as one of its instructors or as one helping run it
-- (NTF-03, D-259, D-400).
--
-- Everybody who joins by a school's link signs up as an instructor, so a manager and an instructor
-- teaching under the school were both welcomed with "Finish setting up and you can take bookings
-- and payments", though the school takes the payments and a manager teaches nobody. The welcome
-- now says which school, and what they do there, when they are at one by the time it is sent.
--
-- system_welcome_notice is the function from 20261022250000_staff_are_not_welcomed_as_learners,
-- with the school added.

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
           'audience', coalesce(u.intended_role::text, 'learner'),
           -- The school they joined, as an instructor teaching under it or a manager (not its owner,
           -- who set it up and is welcomed as a school).
           'school', (
             select jsonb_build_object('name', b.name, 'role', m.role::text)
               from public.memberships m
               join public.businesses b on b.id = m.business_id
              where m.user_id = u.id
                and m.status = 'active'
                and m.role in ('instructor', 'manager')
                and b.type = 'school'
              order by m.created_at
              limit 1
           )
         )
    from public.users u
   where u.id = p_user_id
     and u.email_verified_at is not null
     and not exists (select 1 from public.platform_staff s where s.user_id = u.id);
$$;
