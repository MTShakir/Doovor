-- The gallery: the photo an instructor takes when somebody passes (D-218).
--
-- Not in the PRD. The product owner asked for it, and it is what driving instructors already do
-- on the day: a photo with the certificate, posted somewhere. This gives them somewhere that is
-- their own profile, with the date and the name on it, and a tick from us on the ones we have
-- checked.
--
-- What it is not: a review. Nothing here is written by a learner, nothing is scored, and nothing
-- counts towards a pass rate, which has its own rule and its own threshold (R-17).
--
-- Consent: a named photograph of a person on a public page is theirs, not ours and not the
-- instructor's. The instructor confirms in the form that they have permission, and when that was
-- confirmed is stored on the row, so a complaint has an answer. Staff can take any photo down,
-- which is what `hidden_at` is for: a tick that could only be removed would leave something wrong
-- on a public page with no way to stop it.
--
-- One picture per row. The gallery is a wall of single photos rather than albums, because an
-- album is a thing to curate and this is a thing to add to on the day.

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Whose learner it was. Null once an instructor has left, which leaves the photo with the school.
  instructor_id uuid references public.instructor_profiles (id) on delete set null,
  -- The learner's account where they have one, so a name change follows them.
  learner_id uuid references public.users (id) on delete set null,
  -- What the banner says. Copied from the learner when one is chosen, typed otherwise.
  learner_name text not null check (char_length(btrim(learner_name)) between 1 and 80),
  passed_on date not null,
  -- The picture, in the gallery bucket, as "<business id>/<file>".
  image_path text not null check (char_length(image_path) between 1 and 200),
  -- When the instructor confirmed they have the learner's permission to show it.
  consent_confirmed_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  -- Taken down by staff. The row stays, so the same picture cannot simply be put back.
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.gallery_photos is
  'Pass photos on a Business public profile (D-218). One picture each, with the name and the date the banner says, and a tick from staff on the ones we have checked.';

alter table public.gallery_photos enable row level security;

create index gallery_photos_business_idx on public.gallery_photos (business_id, passed_on desc, created_at desc);
create index gallery_photos_instructor_idx on public.gallery_photos (instructor_id, passed_on desc);
create index gallery_photos_unchecked_idx on public.gallery_photos (created_at desc)
  where verified_at is null and hidden_at is null;

grant select on public.gallery_photos to authenticated;

-- A Business sees its own, taken down or not, so somebody can tell what happened to one.
create policy gallery_read_own on public.gallery_photos
  for select to authenticated
  using (business_id in (select private.auth_business_ids()) or (select private.auth_is_staff()));

-- Everything is written through the functions below: no insert, update or delete grant.

-- ---------------------------------------------------------------------------------------
-- The pictures. Public, like profile photos, and foldered by the Business.
-- ---------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Policies on storage.objects run as the caller. `auth_business_ids` is already granted to
-- `authenticated` with the other helpers, unlike `auth_instructor_ids`, which avatars had to grant.

create policy gallery_read_all on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'gallery');

create policy gallery_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gallery'
    and exists (
      select 1 from private.auth_business_ids() as business_id
       where business_id::text = (storage.foldername(name))[1]
    )
  );

create policy gallery_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gallery'
    and (
      (select private.auth_is_staff())
      or exists (
        select 1 from private.auth_business_ids() as business_id
         where business_id::text = (storage.foldername(name))[1]
      )
    )
  );

-- ---------------------------------------------------------------------------------------
-- add_gallery_photo: one picture, one name, one date.
--
-- Which plans carry the gallery lives in packages/config/src/plans.ts as `gallery`, the way every
-- other entitlement does. This mirrors it, because a rule enforced only in TypeScript is a rule
-- anybody with a session can walk around (D-210).
-- ---------------------------------------------------------------------------------------
create or replace function public.add_gallery_photo(
  p_image_path text,
  p_passed_on date,
  p_learner_id uuid default null,
  p_learner_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_plan public.plan_key;
  v_instructor uuid;
  v_name text := btrim(coalesce(p_learner_name, ''));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- Where they work: the one they own first, then any they belong to. An instructor at a school
  -- adds to the school's gallery, which is whose profile the photo appears on.
  select m.business_id into v_business
    from public.memberships m
   where m.user_id = v_user and m.status = 'active'
   order by case when m.role = 'owner' then 0 else 1 end
   limit 1;

  select i.id into v_instructor
    from public.instructor_profiles i
   where i.business_id = v_business and i.user_id = v_user
   limit 1;

  -- An instructor at a school posts their own pass photos: `manage_profile` belongs to owners and
  -- managers (SCH-02), and requiring it would mean nobody who actually teaches could add one.
  if v_business is null or not (v_instructor is not null or private.auth_has_permission(v_business, 'manage_profile')) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select b.plan into v_plan from public.businesses b where b.id = v_business;
  if v_plan = 'free' then
    raise exception 'PLAN_REQUIRED';
  end if;

  if p_passed_on is null or p_passed_on > private.today() or p_passed_on < private.today() - interval '10 years' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "passedOn"}';
  end if;

  -- The picture is in this Business folder or it is nobody's.
  if p_image_path is null or p_image_path !~ ('^' || v_business::text || '/[A-Za-z0-9_.-]{1,80}$') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "imagePath"}';
  end if;

  -- A learner chosen from the list has to be one this person may see, and their name comes from
  -- the account rather than the form, so the banner cannot say something they never agreed to.
  if p_learner_id is not null then
    if not private.auth_can_see_learner(p_learner_id) then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
    select btrim(u.full_name) into v_name from public.users u where u.id = p_learner_id;
  end if;
  if char_length(coalesce(v_name, '')) not between 1 and 80 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "learnerName"}';
  end if;

  insert into public.gallery_photos (business_id, instructor_id, learner_id, learner_name, passed_on, image_path, created_by)
  values (v_business, v_instructor, p_learner_id, v_name, p_passed_on, p_image_path, v_user)
  returning id into v_id;

  perform private.write_audit('gallery.added', 'gallery_photo', v_id, v_business, null,
    jsonb_build_object('passed_on', p_passed_on, 'from_the_list', p_learner_id is not null));
  return v_id;
end;
$$;

revoke all on function public.add_gallery_photo(text, date, uuid, text) from public, anon;
grant execute on function public.add_gallery_photo(text, date, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- remove_gallery_photo: the Business takes its own down. Staff hide instead, below.
-- ---------------------------------------------------------------------------------------
create or replace function public.remove_gallery_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_photo public.gallery_photos;
begin
  select * into v_photo from public.gallery_photos where id = p_photo_id;
  if v_photo.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- The instructor whose photo it is, or somebody who looks after the Business profile.
  if not (
    private.auth_has_permission(v_photo.business_id, 'manage_profile')
    or exists (
      select 1 from public.instructor_profiles i
       where i.id = v_photo.instructor_id and i.user_id = v_user
    )
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  delete from public.gallery_photos where id = p_photo_id;

  perform private.write_audit('gallery.removed', 'gallery_photo', p_photo_id, v_photo.business_id,
    jsonb_build_object('passed_on', v_photo.passed_on), null);
  -- The picture itself is the caller's to delete from storage, which its own policy allows.
  return v_photo.image_path;
end;
$$;

revoke all on function public.remove_gallery_photo(uuid) from public, anon;
grant execute on function public.remove_gallery_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- What a Business shows: its own gallery, read by anybody, including nobody at all.
--
-- Served only while the plan carries it. A Business that drops to Free keeps its photos, and the
-- profile stops showing them until the plan carries it again, the way its colour works (D-210).
-- ---------------------------------------------------------------------------------------
create or replace function private.gallery_of(p_business_id uuid, p_instructor_id uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', g.id,
               'learnerName', g.learner_name,
               'passedOn', g.passed_on,
               'imagePath', g.image_path,
               'verified', g.verified_at is not null
             )
             order by g.passed_on desc, g.created_at desc
           ),
           '[]'::jsonb
         )
    from (
      select *
        from public.gallery_photos
       where business_id = p_business_id
         and hidden_at is null
         and (p_instructor_id is null or instructor_id = p_instructor_id)
       order by passed_on desc, created_at desc
       limit 24
    ) g;
$$;

create or replace function public.instructor_gallery(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'businessName', b.name,
           -- The banner is drawn in the Business own colour, the same one the booking page uses.
           'colour', b.brand_colour,
           'photos', private.gallery_of(b.id, i.id)
         )
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
   where i.public_slug = p_slug
     and i.verification_status = 'approved'
     and b.status = 'active'
     and b.plan <> 'free';
$$;

revoke all on function public.instructor_gallery(text) from public;
grant execute on function public.instructor_gallery(text) to anon, authenticated;

create or replace function public.school_gallery(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'businessName', b.name,
           'colour', b.brand_colour,
           -- Every instructor's, because it is the school's wall.
           'photos', private.gallery_of(b.id)
         )
    from public.businesses b
   where b.slug = p_slug
     and b.type = 'school'
     and b.status = 'active'
     and b.plan <> 'free';
$$;

revoke all on function public.school_gallery(text) from public;
grant execute on function public.school_gallery(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- admin_gallery: every Business gallery, for the people who check them.
-- ---------------------------------------------------------------------------------------
create or replace function public.admin_gallery(
  p_business_id uuid default null,
  p_only_unchecked boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 or p_offset is null or p_offset < 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "page"}';
  end if;

  with everything as (
    select g.id, g.learner_name, g.passed_on, g.image_path, g.created_at,
           g.verified_at, g.hidden_at, g.learner_id is not null as from_the_list,
           g.business_id, b.name as business_name, b.type as business_type, b.slug as business_slug,
           i.display_name as instructor_name
      from public.gallery_photos g
      join public.businesses b on b.id = g.business_id
      left join public.instructor_profiles i on i.id = g.instructor_id
     where (p_business_id is null or g.business_id = p_business_id)
       and (not coalesce(p_only_unchecked, false) or (g.verified_at is null and g.hidden_at is null))
  ),
  page as (
    select * from everything order by created_at desc, id desc offset p_offset limit p_limit + 1
  )
  select jsonb_build_object(
           'more', (select count(*) from page) > p_limit,
           'unchecked_count', (select count(*) from public.gallery_photos where verified_at is null and hidden_at is null),
           'rows', coalesce(
             (select jsonb_agg(to_jsonb(shown) order by shown.created_at desc, shown.id desc)
                from (select * from page order by created_at desc, id desc limit p_limit) shown),
             '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_gallery(uuid, boolean, integer, integer) from public, anon;
grant execute on function public.admin_gallery(uuid, boolean, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- admin_check_gallery_photo: the tick. admin_hide_gallery_photo: taking one down.
-- ---------------------------------------------------------------------------------------
create or replace function public.admin_check_gallery_photo(p_photo_id uuid, p_verified boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
begin
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_verified is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "verified"}';
  end if;

  update public.gallery_photos
     set verified_at = case when p_verified then now() end,
         verified_by = case when p_verified then v_user end
   where id = p_photo_id
  returning business_id into v_business;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  perform private.write_audit('gallery.checked', 'gallery_photo', p_photo_id, v_business, null,
    jsonb_build_object('verified', p_verified));
  return p_verified;
end;
$$;

revoke all on function public.admin_check_gallery_photo(uuid, boolean) from public, anon;
grant execute on function public.admin_check_gallery_photo(uuid, boolean) to authenticated;

create or replace function public.admin_hide_gallery_photo(p_photo_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
begin
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_hidden is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "hidden"}';
  end if;

  update public.gallery_photos
     set hidden_at = case when p_hidden then now() end,
         hidden_by = case when p_hidden then v_user end,
         -- Something taken down is not something we have checked and stand behind.
         verified_at = case when p_hidden then null else verified_at end,
         verified_by = case when p_hidden then null else verified_by end
   where id = p_photo_id
  returning business_id into v_business;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  perform private.write_audit('gallery.hidden', 'gallery_photo', p_photo_id, v_business, null,
    jsonb_build_object('hidden', p_hidden));
  return p_hidden;
end;
$$;

revoke all on function public.admin_hide_gallery_photo(uuid, boolean) from public, anon;
grant execute on function public.admin_hide_gallery_photo(uuid, boolean) to authenticated;
