-- A number of their own for everybody on the platform (ADM-02, D-176).
--
-- The product owner asked for an ID that finds a person at once and is never given to anybody
-- else: D000001 for the first, counting up, and a new one for somebody who deletes their account
-- and comes back. A sequence does exactly that, because it never goes backwards, and the screens
-- write it as D and six digits.
--
-- Accounts already here are numbered by when they joined, with the platform's own super admin
-- first, so the founder is D000001. D000000 belongs to nobody: the counter starts at one.

create sequence if not exists public.platform_number_seq as bigint start with 1 minvalue 1;

alter table public.users add column if not exists platform_number bigint;

-- Everybody already here: the super admin first, then in the order they joined.
with ordered as (
  select u.id,
         row_number() over (
           order by (case when s.role = 'super_admin' then 0 else 1 end), u.created_at, u.id
         ) as number
    from public.users u
    left join public.platform_staff s on s.user_id = u.id and s.role = 'super_admin'
)
update public.users u
   set platform_number = o.number
  from ordered o
 where o.id = u.id
   and u.platform_number is null;

select setval('public.platform_number_seq', coalesce((select max(platform_number) from public.users), 0) + 1, false);

alter table public.users alter column platform_number set default nextval('public.platform_number_seq');
alter table public.users alter column platform_number set not null;

create unique index if not exists users_platform_number_idx on public.users (platform_number);

comment on column public.users.platform_number is
  'The number behind their platform ID, D000001 upwards. Never reused, even after an account is erased (D-176).';

/** The number behind an ID somebody typed: "D000123", "d123" or "123", or null for anything else. */
create or replace function private.platform_number_of(p_query text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
           when p_query is null then null
           when btrim(p_query) ~ '^[Dd]?0*[0-9]{1,15}$' then nullif(regexp_replace(btrim(p_query), '^[Dd]', ''), '')::bigint
         end;
$$;

revoke all on function private.platform_number_of(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- The screens that find people carry the ID, and find somebody by it.
-- ---------------------------------------------------------------------------------------
drop function if exists public.admin_instructors(text, integer);
create or replace function public.admin_instructors(p_query text default null, p_limit integer default 25)
returns table (
  user_id uuid,
  platform_number bigint,
  instructor_id uuid,
  display_name text,
  account_name text,
  email text,
  business_id uuid,
  business_name text,
  verification_status public.verification_status,
  suspended boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text := private.contains_pattern(nullif(btrim(coalesce(p_query, '')), ''));
  v_digits text := private.phone_digits(p_query);
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if char_length(v_query) > 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "query"}';
  end if;

  return query
    select i.user_id,
           u.platform_number,
           i.id,
           i.display_name,
           u.full_name,
           u.email,
           b.id,
           b.name,
           i.verification_status,
           exists (select 1 from public.account_suspensions s where s.user_id = i.user_id)
      from public.instructor_profiles i
      join public.users u on u.id = i.user_id
      join public.businesses b on b.id = i.business_id
     where v_query is null
        or u.platform_number = private.platform_number_of(v_query)
        or i.display_name ilike v_pattern
        or u.full_name ilike v_pattern
        or u.email ilike v_pattern
        or i.badge_number ilike v_pattern
        or i.public_slug ilike v_pattern
        or (v_digits is not null and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
     order by i.created_at desc, i.id
     limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

revoke all on function public.admin_instructors(text, integer) from public, anon;
grant execute on function public.admin_instructors(text, integer) to authenticated;

drop function if exists public.admin_learners(text, integer);
create or replace function public.admin_learners(p_query text default null, p_limit integer default 25)
returns table (
  user_id uuid,
  platform_number bigint,
  name text,
  email text,
  businesses integer,
  suspended boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text := private.contains_pattern(nullif(btrim(coalesce(p_query, '')), ''));
  v_digits text := private.phone_digits(p_query);
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if char_length(v_query) > 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "query"}';
  end if;

  return query
    select l.user_id,
           u.platform_number,
           u.full_name,
           u.email,
           (select count(*)::integer from public.learner_relationships r where r.learner_id = l.user_id),
           exists (select 1 from public.account_suspensions s where s.user_id = l.user_id)
      from public.learner_profiles l
      join public.users u on u.id = l.user_id
     where v_query is null
        or u.platform_number = private.platform_number_of(v_query)
        or u.full_name ilike v_pattern
        or u.email ilike v_pattern
        or (v_digits is not null and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
     order by u.created_at desc, u.id
     limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

revoke all on function public.admin_learners(text, integer) from public, anon;
grant execute on function public.admin_learners(text, integer) to authenticated;

-- One person's card carries it too, so staff can read it out over the phone.
create or replace function public.admin_person(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'user_id', u.id,
           'platform_number', u.platform_number,
           'name', u.full_name,
           'email', u.email,
           'phone', u.phone,
           'created_at', u.created_at,
           'last_sign_in_at', a.last_sign_in_at,
           'two_step', exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status = 'verified'),
           'staff_role', (select s.role from public.platform_staff s where s.user_id = u.id),
           'suspension', case when x.user_id is null then null else jsonb_build_object(
             'at', x.suspended_at,
             'reason', x.reason,
             'by_name', (select b.full_name from public.users b where b.id = x.suspended_by)
           ) end,
           'memberships', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'business_id', b.id,
                          'business_name', b.name,
                          'business_status', b.status,
                          'role', m.role,
                          'active', m.status = 'active'
                        )
                        order by b.name
                      )
                 from public.memberships m
                 join public.businesses b on b.id = m.business_id
                where m.user_id = u.id
             ),
             '[]'::jsonb
           ),
           'learns_with', coalesce(
             (
               select jsonb_agg(jsonb_build_object('business_id', b.id, 'business_name', b.name) order by b.name)
                 from public.learner_relationships r
                 join public.businesses b on b.id = r.business_id
                where r.learner_id = u.id
             ),
             '[]'::jsonb
           )
         )
    into v_result
    from public.users u
    join auth.users a on a.id = u.id
    left join public.account_suspensions x on x.user_id = u.id
   where u.id = p_user_id;

  return v_result;
end;
$$;

revoke all on function public.admin_person(uuid) from public, anon;
grant execute on function public.admin_person(uuid) to authenticated;
