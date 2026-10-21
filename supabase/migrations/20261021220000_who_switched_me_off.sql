-- Somebody a school switched off is told which school (SCH-02, D-332). A switched-off member can no
-- longer read the Business their membership belongs to, which is right for everything else, so
-- the name comes from here, for the person asking only, and nothing more than the name.
create or replace function public.my_switched_off_by()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(b.name order by b.name), '{}'::text[])
    from public.memberships m
    join public.businesses b on b.id = m.business_id
   where m.user_id = (select auth.uid())
     and m.status = 'deactivated'
     and b.status <> 'suspended';
$$;

revoke all on function public.my_switched_off_by() from public, anon;
grant execute on function public.my_switched_off_by() to authenticated;
