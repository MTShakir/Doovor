-- A second step somebody turned on is asked for when they sign in (AUTH-08, D-351).
--
-- Two-step verification is required of platform staff and school owners, and anybody else may turn
-- it on from their account. Only the required ones were ever asked for the code: a learner or an
-- instructor who turned it on signed in with their password alone, and their account said "On".
-- The app now asks whether somebody has a second step, and asks for it whoever they are.
--
-- What somebody can open was read in four requests on every screen. Their staff role and whether
-- they have a second step come back together, in the request that read the role alone, so knowing
-- the one costs no more than the other did.

create or replace function public.my_access_flags()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    -- Their own row only, as the table's policy lets them read it.
    'staff_role', (select s.role::text from public.platform_staff s where s.user_id = (select auth.uid())),
    'second_step_on', exists (
      select 1
        from auth.mfa_factors f
       where f.user_id = (select auth.uid())
         and f.status = 'verified'
    )
  );
$$;

revoke all on function public.my_access_flags() from public, anon;
grant execute on function public.my_access_flags() to authenticated;
