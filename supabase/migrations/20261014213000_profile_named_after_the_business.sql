-- An independent instructor's public profile is named after their Business, and lives at an
-- address made from that name (PUB-01, D-269).
--
-- The product owner asked for the Business name as the profile's name and in its link, with the
-- person's own name small above it. D-196 kept the address when a Business was renamed, because it
-- is the booking link an instructor has already given out; that still holds, differently: every
-- address a profile has had keeps working, and sends people to the one it has now. So a profile can
-- follow its Business name without breaking a link on a business card, a text or a search result.
--
-- A school's instructors are not renamed: they all work for the school, which has a profile and an
-- address of its own.

-- ---------------------------------------------------------------------------------------
-- The addresses a profile had before, kept where no screen can see or change them.
-- ---------------------------------------------------------------------------------------
create table private.former_profile_slugs (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  instructor_id uuid not null references public.instructor_profiles (id) on delete cascade,
  retired_at timestamptz not null default now()
);

create index former_profile_slugs_instructor_idx on private.former_profile_slugs (instructor_id);

-- An address is made only here and by the RPCs that make profiles, never by hand: one set by hand
-- could be an address somebody else had, and their old links would land on it.
revoke update (public_slug) on public.instructor_profiles from authenticated;

-- ---------------------------------------------------------------------------------------
-- A free address: never one in use, and never one a profile used to have, which still leads to it.
-- ---------------------------------------------------------------------------------------
create or replace function private.unique_slug(p_base text, p_table text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_base text := left(private.slugify(p_base), 60);
  v_candidate text := v_base;
  v_taken boolean;
begin
  for attempt in 1..10 loop
    if p_table = 'businesses' then
      select exists (select 1 from public.businesses where slug = v_candidate) into v_taken;
    else
      select exists (select 1 from public.instructor_profiles where public_slug = v_candidate)
          or exists (select 1 from private.former_profile_slugs where slug = v_candidate)
        into v_taken;
    end if;
    if not v_taken then
      return v_candidate;
    end if;
    v_candidate := v_base || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
  end loop;
  raise exception 'Could not find a free slug for %', v_base;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- name_profile_after_business: the profile of a Business of one takes an address made from the
-- Business name, and keeps the one it had as a way in. Nothing for a school, or for a profile
-- whose address already says its name. Returns the address it has now.
-- ---------------------------------------------------------------------------------------
create function private.name_profile_after_business(p_business_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
  v_profile uuid;
  v_slug text;
  v_base text;
  v_new text;
begin
  select b.name into v_name from public.businesses b where b.id = p_business_id and b.type = 'independent';
  if v_name is null then
    return null;
  end if;

  select i.id, i.public_slug into v_profile, v_slug
    from public.instructor_profiles i
    join public.memberships m on m.business_id = i.business_id and m.user_id = i.user_id and m.role = 'owner'
   where i.business_id = p_business_id
   limit 1;
  -- No profile, or one taken off the site with its account: nothing to name.
  if v_profile is null or v_slug is null then
    return v_slug;
  end if;

  -- Already the name, or the name with the few letters that told it apart from another.
  v_base := left(private.slugify(v_name), 60);
  if v_slug = v_base or v_slug ~ ('^' || v_base || '-[0-9a-f]{5}$') then
    return v_slug;
  end if;

  -- An address of its own from before comes back as it was; otherwise a free one.
  if exists (select 1 from private.former_profile_slugs f where f.slug = v_base and f.instructor_id = v_profile) then
    v_new := v_base;
  else
    v_new := private.unique_slug(v_name, 'instructor_profiles');
  end if;

  delete from private.former_profile_slugs where slug = v_new and instructor_id = v_profile;
  insert into private.former_profile_slugs (slug, instructor_id) values (v_slug, v_profile)
    on conflict (slug) do nothing;
  update public.instructor_profiles set public_slug = v_new where id = v_profile;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- set_business_name: as before, and the profile follows the name (D-269).
-- ---------------------------------------------------------------------------------------
create or replace function public.set_business_name(p_business_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_before text;
  v_slug_before text;
  v_slug_after text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "name"}';
  end if;
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select name into v_before from public.businesses where id = p_business_id for update;
  if v_before is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  update public.businesses set name = v_name, updated_at = now() where id = p_business_id;

  if v_before is distinct from v_name then
    -- A Business of one's profile follows the name; the audit says where it went from and to.
    select i.public_slug into v_slug_before
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
     where i.business_id = p_business_id and b.type = 'independent'
     limit 1;
    v_slug_after := private.name_profile_after_business(p_business_id);
    perform private.write_audit('business.renamed', 'business', p_business_id, p_business_id,
      jsonb_build_object('name', v_before)
        || case when v_slug_after is null then '{}'::jsonb else jsonb_build_object('profile_slug', v_slug_before) end,
      jsonb_build_object('name', v_name)
        || case when v_slug_after is null then '{}'::jsonb else jsonb_build_object('profile_slug', v_slug_after) end);
  end if;

  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- current_profile_slug: where an address a profile used to have leads now. Null for one that was
-- never a profile's, or whose profile has gone. Both ends are public addresses already.
-- ---------------------------------------------------------------------------------------
create function public.current_profile_slug(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.public_slug
    from private.former_profile_slugs f
    join public.instructor_profiles i on i.id = f.instructor_id
   where f.slug = p_slug
     and i.public_slug is not null;
$$;

revoke all on function public.current_profile_slug(text) from public;
grant execute on function public.current_profile_slug(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- A profile taken off the site with its account takes its old addresses with it: they were made
-- from a name, and nothing should lead anywhere from them now.
-- ---------------------------------------------------------------------------------------
create function private.forget_former_profile_slugs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.former_profile_slugs where instructor_id = new.id;
  return null;
end;
$$;

create trigger instructor_profiles_forget_former_slugs
  after update of public_slug on public.instructor_profiles
  for each row
  when (new.public_slug is null and old.public_slug is not null)
  execute function private.forget_former_profile_slugs();

-- ---------------------------------------------------------------------------------------
-- Every Business of one, now: a profile whose address is not its Business name takes one that is,
-- and the old address leads to it.
-- ---------------------------------------------------------------------------------------
select private.name_profile_after_business(b.id) from public.businesses b where b.type = 'independent';
