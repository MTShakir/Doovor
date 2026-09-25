-- Telling us something: a request, a problem, or anything else (D-202).
--
-- Not in the PRD. It is here because a beta with twenty instructors and no way to say "this is
-- wrong" is a beta that finds out by losing them, and because the bookkeeping shipped with a
-- marker on it asking people to check the figures, which is an invitation to reply to.
--
-- Anybody signed in may send one. What they were working in is recorded where they belong to a
-- Business, so a report about a diary can be read next to the diary it is about.

create type public.feedback_kind as enum ('feature', 'feedback', 'issue', 'other');

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  /** The Business they were working in, where they are in one. */
  business_id uuid references public.businesses (id) on delete set null,
  kind public.feedback_kind not null,
  message text not null check (char_length(btrim(message)) between 1 and 4000),
  /** Up to three pictures, in the private bucket, as "<user id>/<file>". */
  images text[] not null default array[]::text[] check (array_length(images, 1) is null or array_length(images, 1) <= 3),
  /** Which screen they were on, so a report can be placed without asking. */
  page text check (page is null or char_length(page) <= 200),
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.feedback_submissions enable row level security;

create index feedback_submissions_new_idx on public.feedback_submissions (created_at desc) where handled_at is null;
create index feedback_submissions_kind_idx on public.feedback_submissions (kind, created_at desc);

grant select on public.feedback_submissions to authenticated;

-- Somebody reads what they sent. Nobody else does, except staff through the function below.
create policy feedback_read_own on public.feedback_submissions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------
-- The pictures. Private, and foldered by the person who sent them.
-- ---------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy feedback_images_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy feedback_images_read_own_or_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feedback'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.auth_is_staff()))
  );

create policy feedback_images_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------------------
-- submit_feedback: anybody signed in, about anything.
-- ---------------------------------------------------------------------------------------
create or replace function public.submit_feedback(
  p_kind text,
  p_message text,
  p_images text[] default array[]::text[],
  p_page text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_message text := btrim(coalesce(p_message, ''));
  v_images text[] := coalesce(p_images, array[]::text[]);
  v_business uuid;
  v_id uuid;
  v_image text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_kind is null or not exists (
    select 1 from unnest(enum_range(null::public.feedback_kind)) as known where known::text = p_kind
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "kind"}';
  end if;
  if char_length(v_message) not between 1 and 4000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "message"}';
  end if;
  if array_length(v_images, 1) > 3 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "images"}';
  end if;
  -- A picture is theirs or it is nobody's: the path names its folder, and the folder is them.
  foreach v_image in array v_images loop
    if v_image !~ ('^' || v_user::text || '/[A-Za-z0-9_.-]{1,80}$') then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "images"}';
    end if;
  end loop;

  -- Where they work, if anywhere: the one they own first, then any they belong to.
  select m.business_id into v_business
    from public.memberships m
   where m.user_id = v_user and m.status = 'active'
   order by case when m.role = 'owner' then 0 else 1 end
   limit 1;

  insert into public.feedback_submissions (user_id, business_id, kind, message, images, page)
  values (v_user, v_business, p_kind::public.feedback_kind, v_message, v_images,
          nullif(btrim(coalesce(p_page, '')), ''))
  returning id into v_id;

  perform private.write_audit('feedback.submitted', 'feedback', v_id, v_business, null,
    jsonb_build_object('kind', p_kind));
  return v_id;
end;
$$;

revoke all on function public.submit_feedback(text, text, text[], text) from public, anon;
grant execute on function public.submit_feedback(text, text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- admin_feedback: what people have told us, for the people who can do something about it.
-- ---------------------------------------------------------------------------------------
create or replace function public.admin_feedback(
  p_kind text default null,
  p_only_new boolean default false,
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
  if p_kind is not null and not exists (
    select 1 from unnest(enum_range(null::public.feedback_kind)) as known where known::text = p_kind
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "kind"}';
  end if;

  with everything as (
    select f.id, f.kind, f.message, f.images, f.page, f.created_at, f.handled_at,
           f.user_id, u.full_name as person, u.email as person_email,
           b.name as business_name, b.type as business_type
      from public.feedback_submissions f
      join public.users u on u.id = f.user_id
      left join public.businesses b on b.id = f.business_id
     where (p_kind is null or f.kind::text = p_kind)
       and (not coalesce(p_only_new, false) or f.handled_at is null)
  ),
  page as (
    select * from everything order by created_at desc, id desc offset p_offset limit p_limit + 1
  )
  select jsonb_build_object(
           'more', (select count(*) from page) > p_limit,
           'new_count', (select count(*) from public.feedback_submissions where handled_at is null),
           'rows', coalesce(
             (select jsonb_agg(to_jsonb(shown) order by shown.created_at desc, shown.id desc)
                from (select * from page order by created_at desc, id desc limit p_limit) shown),
             '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_feedback(text, boolean, integer, integer) from public, anon;
grant execute on function public.admin_feedback(text, boolean, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- admin_handle_feedback: read and dealt with, or put back.
-- ---------------------------------------------------------------------------------------
create or replace function public.admin_handle_feedback(p_feedback_id uuid, p_handled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_handled is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "handled"}';
  end if;

  update public.feedback_submissions
     set handled_at = case when p_handled then now() end,
         handled_by = case when p_handled then v_user end
   where id = p_feedback_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  perform private.write_audit('feedback.handled', 'feedback', p_feedback_id, null, null,
    jsonb_build_object('handled', p_handled));
  return p_handled;
end;
$$;

revoke all on function public.admin_handle_feedback(uuid, boolean) from public, anon;
grant execute on function public.admin_handle_feedback(uuid, boolean) to authenticated;
