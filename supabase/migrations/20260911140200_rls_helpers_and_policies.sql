-- RLS helpers and policies for identity and tenancy (ARCHITECTURE.md 6.2 and 6.3).
-- Helpers are STABLE SECURITY DEFINER functions in the private schema with an empty
-- search_path. They read auth.uid() once per statement when wrapped in a subquery.

create or replace function private.auth_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1');
$$;

-- Businesses where the caller has an active membership, optionally limited to roles.
-- Use in policies as: business_id in (select private.auth_business_ids())
create or replace function private.auth_business_ids(p_roles public.membership_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.business_id
    from public.memberships m
   where m.user_id = (select auth.uid())
     and m.status = 'active'
     and (p_roles is null or m.role = any (p_roles));
$$;

create or replace function private.auth_is_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.business_id = p_business_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
  );
$$;

create or replace function private.auth_has_role(p_business_id uuid, p_roles public.membership_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
     where m.business_id = p_business_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and m.role = any (p_roles)
  );
$$;

-- Platform staff with a verified second factor (AUTH-08). p_level: 'support' or 'super'.
create or replace function private.auth_is_staff(p_level text default 'support')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_aal() = 'aal2'
     and exists (
       select 1 from public.platform_staff s
        where s.user_id = (select auth.uid())
          and (p_level = 'support' or s.role = 'super_admin')
     );
$$;

-- Role defaults from the PRD 6.2 permission matrix. Memberships can override any of
-- these per member (SCH-02) except manage_billing, which only owners ever have.
create or replace function private.role_permission_default(p_role public.membership_role, p_permission text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then true
    when 'manager' then p_permission in (
      'manage_profile', 'manage_members', 'manage_bookings', 'manage_availability',
      'set_prices', 'issue_refunds', 'view_learners'
    )
    else false
  end;
$$;

create or replace function private.auth_has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when p_permission = 'manage_billing' then m.role = 'owner'
      when m.role = 'owner' then true
      else coalesce(m.permissions -> p_permission = 'true'::jsonb, private.role_permission_default(m.role, p_permission))
    end
      from public.memberships m
      join public.businesses b on b.id = m.business_id
     where m.business_id = p_business_id
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and b.status <> 'suspended'
  ), false);
$$;

-- True when the caller and the target user are active members of the same Business.
create or replace function private.auth_shares_business_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships mine
      join public.memberships theirs on theirs.business_id = mine.business_id
     where mine.user_id = (select auth.uid())
       and mine.status = 'active'
       and theirs.user_id = p_user_id
       and theirs.status = 'active'
  );
$$;

grant execute on function
  private.auth_aal(),
  private.auth_business_ids(public.membership_role[]),
  private.auth_is_member(uuid),
  private.auth_has_role(uuid, public.membership_role[]),
  private.auth_is_staff(text),
  private.role_permission_default(public.membership_role, text),
  private.auth_has_permission(uuid, text),
  private.auth_shares_business_with(uuid)
to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------------------
grant select on public.users to authenticated;
grant update (full_name, avatar_url, locale, timezone, intended_role, marketing_consent, analytics_consent)
  on public.users to authenticated;

create policy users_select_self on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy users_select_colleagues on public.users
  for select to authenticated
  using (private.auth_shares_business_with(id));

create policy users_select_staff on public.users
  for select to authenticated
  using ((select private.auth_is_staff()));

create policy users_update_self on public.users
  for update to authenticated
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- platform_staff: people can see their own staff row (needed before MFA); super admins see all.
-- ---------------------------------------------------------------------------------------
grant select on public.platform_staff to authenticated;

create policy platform_staff_select_self on public.platform_staff
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy platform_staff_select_super on public.platform_staff
  for select to authenticated
  using ((select private.auth_is_staff('super')));

-- ---------------------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------------------
grant select on public.businesses to authenticated;
grant update (name, logo_url, base_postcode, base_location, address, timezone, vat_number, settings)
  on public.businesses to authenticated;

create policy businesses_select_members on public.businesses
  for select to authenticated
  using (id in (select private.auth_business_ids()));

create policy businesses_select_staff on public.businesses
  for select to authenticated
  using ((select private.auth_is_staff()));

create policy businesses_update_profile on public.businesses
  for update to authenticated
  using (private.auth_has_permission(id, 'manage_profile'))
  with check (private.auth_has_permission(id, 'manage_profile'));

-- ---------------------------------------------------------------------------------------
-- memberships: your own, or all of a Business you own or manage. Writes go through RPCs.
-- ---------------------------------------------------------------------------------------
grant select on public.memberships to authenticated;

create policy memberships_select_self on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_select_business_admins on public.memberships
  for select to authenticated
  using (business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[])));

create policy memberships_select_staff on public.memberships
  for select to authenticated
  using ((select private.auth_is_staff()));

-- ---------------------------------------------------------------------------------------
-- invitations: seen by the Business's owners and managers and by whoever sent them.
-- ---------------------------------------------------------------------------------------
grant select on public.invitations to authenticated;

create policy invitations_select_business_admins on public.invitations
  for select to authenticated
  using (business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[])));

create policy invitations_select_sender on public.invitations
  for select to authenticated
  using (invited_by = (select auth.uid()));

create policy invitations_select_staff on public.invitations
  for select to authenticated
  using ((select private.auth_is_staff()));

-- ---------------------------------------------------------------------------------------
-- platform_settings: readable by signed-in users; changed by Super Admin RPCs (M5).
-- ---------------------------------------------------------------------------------------
grant select on public.platform_settings to authenticated;

create policy platform_settings_select on public.platform_settings
  for select to authenticated
  using (true);
