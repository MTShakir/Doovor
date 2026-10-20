-- New pupils for a school: asked from its public page, or added by its office (M9-15, M9-16, D-288).
--
-- Somebody who wants lessons leaves their name, a way to reach them, their postcode and what they
-- want, and agrees, in words kept with the enquiry, to the school keeping those details and passing
-- them to an instructor. The school's owner and managers see them in an inbox: new, offered to
-- instructors, taken by one, or closed. Nobody else reads them. An enquiry closed or left for a year
-- is forgotten.

create type public.school_enquiry_status as enum ('new', 'offered', 'taken', 'closed');

create table public.school_enquiries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.businesses (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text check (char_length(email) <= 254),
  phone text check (phone ~ '^\+447[0-9]{9}$'),
  postcode text not null check (postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'),
  -- Null when either will do.
  transmission public.learner_transmission,
  -- When suits them, and anything else they want the school to know.
  note text check (char_length(note) <= 500),
  source text not null check (source in ('public', 'office')),
  -- The words they agreed to, as they were shown.
  consent_wording text not null check (char_length(consent_wording) between 1 and 500),
  consented_at timestamptz not null default now(),
  status public.school_enquiry_status not null default 'new',
  taken_business_id uuid references public.businesses (id) on delete set null,
  taken_instructor_id uuid references public.instructor_profiles (id) on delete set null,
  taken_learner_id uuid references public.users (id) on delete set null,
  taken_at timestamptz,
  closed_reason text check (char_length(closed_reason) <= 200),
  closed_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_enquiries_contact check (email is not null or phone is not null),
  constraint school_enquiries_closed check ((status = 'closed') = (closed_at is not null)),
  constraint school_enquiries_taken check ((status = 'taken') = (taken_at is not null))
);

create index school_enquiries_inbox on public.school_enquiries (school_id, status, created_at desc);

comment on table public.school_enquiries is
  'People who asked a school for lessons, with their consent to being passed to an instructor (D-288).';

create trigger school_enquiries_updated_at
  before update on public.school_enquiries
  for each row execute function private.set_updated_at();

alter table public.school_enquiries enable row level security;

create policy school_enquiries_read on public.school_enquiries
  for select to authenticated
  using (private.auth_has_role(school_id, array['owner', 'manager']::public.membership_role[]));

grant select on public.school_enquiries to authenticated;

-- ---------------------------------------------------------------------------------------
-- The checks a new enquiry passes, from the public page or the office.
-- ---------------------------------------------------------------------------------------
create function private.enquiry_checks(
  p_full_name text,
  p_email text,
  p_phone text,
  p_postcode text,
  p_transmission text,
  p_note text,
  p_consent text,
  out full_name text,
  out email text,
  out phone text,
  out postcode text,
  out transmission public.learner_transmission,
  out note text,
  out consent text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  full_name := btrim(coalesce(p_full_name, ''));
  if char_length(full_name) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "fullName"}';
  end if;
  email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  if email is not null and (email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(email) > 254) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "email"}';
  end if;
  phone := nullif(btrim(coalesce(p_phone, '')), '');
  if phone is not null and phone !~ '^\+447[0-9]{9}$' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "phone"}';
  end if;
  if email is null and phone is null then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "email", "reason": "no_contact"}';
  end if;
  select c.postcode into postcode from private.capture_postcode(p_postcode) c;
  if p_transmission is not null and p_transmission not in ('manual', 'automatic') then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "transmission"}';
  end if;
  transmission := p_transmission::public.learner_transmission;
  note := nullif(btrim(coalesce(p_note, '')), '');
  if char_length(note) > 500 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "note"}';
  end if;
  consent := btrim(coalesce(p_consent, ''));
  if consent = '' or char_length(consent) > 500 then
    raise exception 'CONSENT_REQUIRED' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.enquiry_checks(text, text, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- submit_school_enquiry: from the school's public page, by anybody, signed in or not. Answers
-- the same whatever happens to it, so it says nothing about the school's inbox.
-- ---------------------------------------------------------------------------------------
create function public.submit_school_enquiry(
  p_slug text,
  p_full_name text,
  p_postcode text,
  p_consent text,
  p_email text default null,
  p_phone text default null,
  p_transmission text default null,
  p_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_checked record;
  v_id uuid;
begin
  select b.id into v_school
    from public.businesses b
   where b.slug = p_slug and b.type = 'school' and b.status = 'active';
  if v_school is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  -- Ten an hour from one place, and no more than a busy day's worth for everybody.
  if not private.capture_allowed('school-enquiry', 10, 2000) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  select * into v_checked from private.enquiry_checks(p_full_name, p_email, p_phone, p_postcode, p_transmission, p_note, p_consent);

  insert into public.school_enquiries (school_id, full_name, email, phone, postcode, transmission, note, source, consent_wording, created_by)
  values (v_school, v_checked.full_name, v_checked.email, v_checked.phone, v_checked.postcode, v_checked.transmission,
          v_checked.note, 'public', v_checked.consent, (select auth.uid()))
  returning id into v_id;

  perform private.write_audit('school.enquiry_received', 'school_enquiry', v_id, v_school, null,
    jsonb_build_object('source', 'public'));
end;
$$;

revoke all on function public.submit_school_enquiry(text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_school_enquiry(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- add_school_enquiry: the office types in somebody who rang or walked in, having asked them.
-- ---------------------------------------------------------------------------------------
create function public.add_school_enquiry(
  p_school_id uuid,
  p_full_name text,
  p_postcode text,
  p_consent text,
  p_email text default null,
  p_phone text default null,
  p_transmission text default null,
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_checked record;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_school_id and b.type = 'school')
     or not private.auth_has_role(p_school_id, array['owner', 'manager']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select * into v_checked from private.enquiry_checks(p_full_name, p_email, p_phone, p_postcode, p_transmission, p_note, p_consent);

  insert into public.school_enquiries (school_id, full_name, email, phone, postcode, transmission, note, source, consent_wording, created_by)
  values (p_school_id, v_checked.full_name, v_checked.email, v_checked.phone, v_checked.postcode, v_checked.transmission,
          v_checked.note, 'office', v_checked.consent, (select auth.uid()))
  returning id into v_id;

  perform private.write_audit('school.enquiry_received', 'school_enquiry', v_id, p_school_id, null,
    jsonb_build_object('source', 'office'));
  return v_id;
end;
$$;

revoke all on function public.add_school_enquiry(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.add_school_enquiry(uuid, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- close_school_enquiry and reopen_school_enquiry: an enquiry that went nowhere, and one that
-- comes back. An enquiry already taken stays taken.
-- ---------------------------------------------------------------------------------------
create function public.close_school_enquiry(p_enquiry_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry public.school_enquiries;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_enquiry from public.school_enquiries where id = p_enquiry_id for update;
  if v_enquiry.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_role(v_enquiry.school_id, array['owner', 'manager']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if char_length(v_reason) > 200 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;
  if v_enquiry.status = 'taken' then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "taken"}';
  end if;
  if v_enquiry.status = 'closed' then
    return;
  end if;

  update public.school_enquiries
     set status = 'closed', closed_at = now(), closed_reason = v_reason
   where id = v_enquiry.id;

  perform private.write_audit('school.enquiry_closed', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
    jsonb_build_object('status', v_enquiry.status), jsonb_build_object('status', 'closed', 'reason', v_reason));
end;
$$;

revoke all on function public.close_school_enquiry(uuid, text) from public, anon;
grant execute on function public.close_school_enquiry(uuid, text) to authenticated;

create function public.reopen_school_enquiry(p_enquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry public.school_enquiries;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_enquiry from public.school_enquiries where id = p_enquiry_id for update;
  if v_enquiry.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_role(v_enquiry.school_id, array['owner', 'manager']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_enquiry.status <> 'closed' then
    return;
  end if;

  update public.school_enquiries
     set status = 'new', closed_at = null, closed_reason = null
   where id = v_enquiry.id;

  perform private.write_audit('school.enquiry_reopened', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
    jsonb_build_object('status', 'closed'), jsonb_build_object('status', 'new'));
end;
$$;

revoke all on function public.reopen_school_enquiry(uuid) from public, anon;
grant execute on function public.reopen_school_enquiry(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- system_forget_school_enquiries: an enquiry closed a year ago, or new and untouched for a year,
-- is deleted with the details in it. One taken by an instructor lives on as their learner.
-- ---------------------------------------------------------------------------------------
create function public.system_forget_school_enquiries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.school_enquiries e
   where (e.status = 'closed' and e.closed_at < now() - interval '1 year')
      or (e.status = 'new' and e.updated_at < now() - interval '1 year')
      or (e.status = 'taken' and e.taken_at < now() - interval '1 year');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.system_forget_school_enquiries() from public, anon, authenticated;
grant execute on function public.system_forget_school_enquiries() to service_role;

select cron.schedule('forget-school-enquiries', '23 3 * * *', $$select public.system_forget_school_enquiries()$$);
