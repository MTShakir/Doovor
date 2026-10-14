-- Pass photos are shown whole, at their own shape (D-267).
--
-- The wall drew every photo in a box four wide and three high and cut off whatever did not fit,
-- and a photo taken upright on a phone, which is most of them, lost its top and its bottom: the
-- learner's head, or the certificate in their hands. The picture itself was always kept whole
-- (D-218). Now it is shown whole, and its width and height are written down as it is added, so a
-- page keeps the right room for it before it arrives instead of moving everything under it when
-- it does. Photos added before this have neither, and take their shape as they load.

alter table public.gallery_photos
  add column image_width integer check (image_width between 1 and 10000),
  add column image_height integer check (image_height between 1 and 10000),
  add constraint gallery_photos_size_together check ((image_width is null) = (image_height is null));

-- ---------------------------------------------------------------------------------------
-- add_gallery_photo takes the size as well.
--
-- Dropped and made again rather than replaced: with two more arguments it is a second function,
-- and a call naming only the first four could no longer say which of the two it meant.
-- ---------------------------------------------------------------------------------------
drop function public.add_gallery_photo(text, date, uuid, text);

create function public.add_gallery_photo(
  p_image_path text,
  p_passed_on date,
  p_learner_id uuid default null,
  p_learner_name text default null,
  p_image_width integer default null,
  p_image_height integer default null
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

  -- Its size, both or neither (D-267). Neither is a page open from before the size was sent, and
  -- that photo simply takes its shape as it loads.
  if (p_image_width is null) <> (p_image_height is null)
     or p_image_width not between 1 and 10000
     or p_image_height not between 1 and 10000 then
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

  insert into public.gallery_photos (
    business_id, instructor_id, learner_id, learner_name, passed_on, image_path, image_width, image_height, created_by
  )
  values (v_business, v_instructor, p_learner_id, v_name, p_passed_on, p_image_path, p_image_width, p_image_height, v_user)
  returning id into v_id;

  perform private.write_audit('gallery.added', 'gallery_photo', v_id, v_business, null,
    jsonb_build_object('passed_on', p_passed_on, 'from_the_list', p_learner_id is not null));
  return v_id;
end;
$$;

revoke all on function public.add_gallery_photo(text, date, uuid, text, integer, integer) from public, anon;
grant execute on function public.add_gallery_photo(text, date, uuid, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- What a Business shows, now with each photo's size, which is null for the ones from before.
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
               'width', g.image_width,
               'height', g.image_height,
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

-- ---------------------------------------------------------------------------------------
-- admin_gallery: the same, with the size, so the people who check a photo see all of it.
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
    select g.id, g.learner_name, g.passed_on, g.image_path, g.image_width, g.image_height, g.created_at,
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
