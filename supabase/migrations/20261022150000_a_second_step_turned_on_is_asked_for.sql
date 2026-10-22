-- A second step somebody turned on is asked for when they sign in (AUTH-08, D-351).
--
-- Two-step verification is required of platform staff and school owners, and anybody else may turn
-- it on from their account. Only the required ones were ever asked for the code: a learner or an
-- instructor who turned it on signed in with their password alone, and their account said "On".
-- The app now asks whether somebody has a second step, and asks for it whoever they are.

create or replace function public.my_second_step_on()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.mfa_factors f
     where f.user_id = (select auth.uid())
       and f.status = 'verified'
  );
$$;

revoke all on function public.my_second_step_on() from public, anon;
grant execute on function public.my_second_step_on() to authenticated;
