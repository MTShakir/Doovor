-- Every report gets a reference, and both ends of it get an email (D-202, D-241).
--
-- Somebody who tells us something now has a number to say back to us, and hears twice: once when
-- it arrives, and once when a person has dealt with it. Until now the only reply was a staff
-- member remembering to press a mailto link.
--
-- The reference is "R" and a number, zero padded to two digits: R01 to R09, then R10, R99, R100.
-- It keeps the shape the product owner asked for through the first hundred and does not stop
-- there. It comes from a sequence rather than from counting rows, because two reports arriving in
-- the same moment would otherwise be handed the same number.

create sequence public.feedback_reference_seq as bigint;

comment on sequence public.feedback_reference_seq is
  'What a report is called when somebody writes to us about it (D-241).';

alter table public.feedback_submissions add column reference text;

-- What is already here, oldest first, so the numbers run the way the reports did.
with ordered as (
  select id, row_number() over (order by created_at, id) as n
    from public.feedback_submissions
)
update public.feedback_submissions f
   set reference = 'R' || lpad(ordered.n::text, 2, '0')
  from ordered
 where ordered.id = f.id;

-- The sequence carries on from the end of that. `false` means the next call returns this number
-- rather than the one after it, so an empty table starts at R01 instead of R02.
select setval(
  'public.feedback_reference_seq',
  (select count(*) from public.feedback_submissions) + 1,
  false
);

alter table public.feedback_submissions
  alter column reference set default ('R' || lpad(nextval('public.feedback_reference_seq')::text, 2, '0')),
  alter column reference set not null,
  add constraint feedback_submissions_reference_key unique (reference);

comment on column public.feedback_submissions.reference is
  'R01, R02, R100: what this report is called to the person who sent it (D-241).';

-- ---------------------------------------------------------------------------------------
-- submit_feedback: answers with the reference, and asks for the confirmation to be sent.
-- ---------------------------------------------------------------------------------------
-- Dropped rather than replaced because the answer is no longer a bare id: a screen that cannot
-- show somebody their reference is the whole of what this change is for.
drop function if exists public.submit_feedback(text, text, text[], text);

create or replace function public.submit_feedback(
  p_kind text,
  p_message text,
  p_images text[] default array[]::text[],
  p_page text default null
)
returns jsonb
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
  v_reference text;
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
  returning id, reference into v_id, v_reference;

  perform private.write_audit('feedback.submitted', 'feedback', v_id, v_business, null,
    jsonb_build_object('kind', p_kind, 'reference', v_reference));
  -- In the same transaction as the row, so a confirmation is never promised for a report that
  -- was rolled back, and never missed for one that was not.
  perform private.enqueue_event('feedback.submitted', jsonb_build_object('feedback_id', v_id));

  return jsonb_build_object('id', v_id, 'reference', v_reference);
end;
$$;

revoke all on function public.submit_feedback(text, text, text[], text) from public, anon;
grant execute on function public.submit_feedback(text, text, text[], text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- admin_handle_feedback: dealing with one tells the person it has been dealt with.
-- ---------------------------------------------------------------------------------------
-- Only on the way in. Putting a report back is staff correcting themselves, and somebody who has
-- already been told it was dealt with does not need telling that it was not.
create or replace function public.admin_handle_feedback(p_feedback_id uuid, p_handled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_was timestamptz;
begin
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_handled is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "handled"}';
  end if;

  select handled_at into v_was from public.feedback_submissions where id = p_feedback_id;

  update public.feedback_submissions
     set handled_at = case when p_handled then now() end,
         handled_by = case when p_handled then v_user end
   where id = p_feedback_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  perform private.write_audit('feedback.handled', 'feedback', p_feedback_id, null, null,
    jsonb_build_object('handled', p_handled));

  -- Pressed twice on a report already dealt with, nobody is emailed twice.
  if p_handled and v_was is null then
    perform private.enqueue_event('feedback.handled', jsonb_build_object('feedback_id', p_feedback_id));
  end if;

  return p_handled;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- admin_feedback: staff see the reference, because that is what people will quote at them.
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
    select f.id, f.reference, f.kind, f.message, f.images, f.page, f.created_at, f.handled_at,
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

-- ---------------------------------------------------------------------------------------
-- system_feedback_for_email: what the job needs to write to somebody about their report.
-- ---------------------------------------------------------------------------------------
-- A job is nobody, so it reads through this rather than touching the table. It carries the name
-- and the address because an email needs them, and the message itself because a confirmation
-- that does not quote what was said is a confirmation of nothing in particular. Nothing here is
-- reachable by anybody signed in.
create or replace function public.system_feedback_for_email(p_feedback_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', f.id,
           'reference', f.reference,
           'kind', f.kind::text,
           'message', f.message,
           'handled', f.handled_at is not null,
           'name', u.full_name,
           'email', u.email
         )
    from public.feedback_submissions f
    join public.users u on u.id = f.user_id
   where f.id = p_feedback_id;
$$;

comment on function public.system_feedback_for_email(uuid) is
  'What the confirmation emails about one report need (D-241).';

revoke all on function public.system_feedback_for_email(uuid) from public, anon, authenticated;
grant execute on function public.system_feedback_for_email(uuid) to service_role;
