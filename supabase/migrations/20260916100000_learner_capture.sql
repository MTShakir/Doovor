-- Coming soon: the learner waiting list and lesson requests (MKT-10, PRD 4.2, M5-10).
--
-- The learner marketplace opens one postcode area at a time (PRD 4.1, 4.2). Until an area opens,
-- a learner there can join its waiting list or post a lesson request. Both are kept only with the
-- learner's consent, in the words they agreed to, and everything kept for an address can be removed
-- from the link in the email that confirms it, which carries a token and nothing else. They are
-- demand data for opening an area (ADM-04, M5-19); nothing is shared with instructors in Phase 1.
--
-- Anybody may use these without an account, straight through the API, so the functions guard
-- themselves (D-117): each counts its caller's address and everybody's together, and an address is
-- sent at most one confirmation email a day, so none of it can be turned against somebody else's
-- inbox.

-- An area with no row is closed. Super Admin opens areas (ADM-04, M5-19).
create table public.marketplace_regions (
  postcode_area text primary key check (postcode_area ~ '^[A-Z]{1,2}$'),
  marketplace_enabled boolean not null default false,
  switched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger marketplace_regions_updated_at
  before update on public.marketplace_regions
  for each row execute function private.set_updated_at();

alter table public.marketplace_regions enable row level security;
grant select on public.marketplace_regions to anon, authenticated;
create policy marketplace_regions_select_all on public.marketplace_regions for select to anon, authenticated using (true);

create table public.area_waiting_list (
  id uuid primary key default gen_random_uuid(),
  postcode text not null check (postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'),
  postcode_area text not null check (postcode_area ~ '^[A-Z]{1,2}$'),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- 'both' is a learner happy with either.
  transmission public.transmission,
  user_id uuid references public.users (id) on delete set null,
  consent_wording text not null check (char_length(consent_wording) between 1 and 500),
  consented_at timestamptz not null default now(),
  token uuid not null unique default gen_random_uuid(),
  confirmation_sent_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now()
);

-- One place on an area's list for each address, until it is left.
create unique index area_waiting_list_one_each on public.area_waiting_list (lower(email), postcode_area) where left_at is null;
create index area_waiting_list_area on public.area_waiting_list (postcode_area) where left_at is null;
create index area_waiting_list_email on public.area_waiting_list (lower(email));

alter table public.area_waiting_list enable row level security;
-- Reached only through the functions below. Explicit, so the intent reads, and so every table
-- still carries a policy.
create policy area_waiting_list_no_direct_access on public.area_waiting_list for all to authenticated using (false) with check (false);

create table public.lesson_requests (
  id uuid primary key default gen_random_uuid(),
  postcode text not null check (postcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$'),
  postcode_area text not null check (postcode_area ~ '^[A-Z]{1,2}$'),
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  transmission public.transmission not null,
  experience text not null check (experience in ('none', 'some', 'test_booked')),
  -- ISO weekdays, Monday 1 to Sunday 7.
  days smallint[] not null check (cardinality(days) between 1 and 7 and days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  times text[] not null check (cardinality(times) between 1 and 3 and times <@ array['morning', 'afternoon', 'evening']),
  start_when text not null check (start_when in ('now', 'this_month', 'later')),
  -- The most they would pay for an hour, when they say.
  budget_pence integer check (budget_pence is null or budget_pence between 100 and 20000),
  user_id uuid references public.users (id) on delete set null,
  consent_wording text not null check (char_length(consent_wording) between 1 and 500),
  consented_at timestamptz not null default now(),
  token uuid not null unique default gen_random_uuid(),
  confirmation_sent_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger lesson_requests_updated_at
  before update on public.lesson_requests
  for each row execute function private.set_updated_at();

-- One open request for each address in an area; posting again replaces what it says.
create unique index lesson_requests_one_open on public.lesson_requests (lower(email), postcode_area) where withdrawn_at is null;
create index lesson_requests_area on public.lesson_requests (postcode_area) where withdrawn_at is null;
create index lesson_requests_email on public.lesson_requests (lower(email));

alter table public.lesson_requests enable row level security;
create policy lesson_requests_no_direct_access on public.lesson_requests for all to authenticated using (false) with check (false);

-- The caller: their account when signed in, otherwise the first address the edge in front of the
-- API reports.
create or replace function private.capture_caller()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.uid())::text,
    nullif(btrim(split_part(coalesce(private.request_header('x-forwarded-for'), ''), ',', 1)), ''),
    'unknown'
  );
$$;

-- Counts one use of a capture function by its caller and by everybody, within an hour.
create or replace function private.capture_allowed(p_action text, p_each integer, p_everybody integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_each boolean;
  v_everybody boolean;
begin
  -- Both are counted every time, so a caller over their own limit still counts against everybody's.
  v_each := private.rate_limit_hit('capture-' || p_action || ':' || private.capture_caller(), interval '1 hour', p_each);
  v_everybody := private.rate_limit_hit('capture-' || p_action || ':everybody', interval '1 hour', p_everybody);
  return v_each and v_everybody;
end;
$$;

-- A postcode in its canonical form ("LS6 3QS") and its area ("LS"), or VALIDATION_FAILED.
create or replace function private.capture_postcode(p_postcode text, out postcode text, out postcode_area text)
language plpgsql
immutable
set search_path = ''
as $$
begin
  postcode := upper(btrim(coalesce(p_postcode, '')));
  if postcode !~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$' then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "postcode"}';
  end if;
  postcode_area := substring(postcode from '^[A-Z]{1,2}');
end;
$$;

-- Whether the learner marketplace is open in a postcode's area. Counts as a look, because the app
-- looks the postcode up before it asks.
create or replace function public.coming_soon_area(p_postcode text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_place record;
begin
  select * into v_place from private.capture_postcode(p_postcode);
  if not private.capture_allowed('look', 30, 3000) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'postcode', v_place.postcode,
    'postcodeArea', v_place.postcode_area,
    'open', coalesce((select r.marketplace_enabled from public.marketplace_regions r where r.postcode_area = v_place.postcode_area), false)
  );
end;
$$;

revoke all on function public.coming_soon_area(text) from public;
grant execute on function public.coming_soon_area(text) to anon, authenticated;

-- The checks both kinds share: allowed, consent given, an address that could be one, and an area not
-- yet open. Answers the postcode and its area.
create or replace function private.capture_checks(
  p_postcode text,
  p_email text,
  p_full_name text,
  p_consent text,
  out postcode text,
  out postcode_area text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  select c.postcode, c.postcode_area into postcode, postcode_area from private.capture_postcode(p_postcode) c;
  if not private.capture_allowed('keep', 10, 1000) then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_consent), '') = '' then
    raise exception 'CONSENT_REQUIRED' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(btrim(p_email)) > 254 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "email"}';
  end if;
  if char_length(btrim(coalesce(p_full_name, ''))) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001', detail = '{"field": "fullName"}';
  end if;
  if exists (select 1 from public.marketplace_regions r where r.postcode_area = capture_checks.postcode_area and r.marketplace_enabled) then
    raise exception 'MARKETPLACE_OPEN' using errcode = 'P0001';
  end if;
end;
$$;

-- Asks for a confirmation email for an entry, unless the address has been sent or promised one in
-- the last day: the email's link removes everything kept for the address, so one is enough.
create or replace function private.capture_confirm(p_kind text, p_id uuid, p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (
       select 1 from public.area_waiting_list w
        where lower(w.email) = lower(p_email) and w.id <> p_id and w.created_at > now() - interval '1 day'
     )
     or exists (
       select 1 from public.lesson_requests r
        where lower(r.email) = lower(p_email) and r.id <> p_id and r.created_at > now() - interval '1 day'
     ) then
    return;
  end if;
  perform private.enqueue_event('learner_capture.created', jsonb_build_object('kind', p_kind, 'id', p_id));
end;
$$;

-- Joins an area's waiting list, or, for an address already on it, updates the place. Answers the
-- same either way, so nobody can use it to learn whether an address is on a list.
create or replace function public.join_area_waiting_list(
  p_postcode text,
  p_full_name text,
  p_email text,
  p_consent text,
  p_transmission public.transmission default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_place record;
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  select * into v_place from private.capture_checks(p_postcode, p_email, p_full_name, p_consent);

  update public.area_waiting_list w
     set postcode = v_place.postcode,
         full_name = btrim(p_full_name),
         transmission = p_transmission,
         user_id = coalesce((select auth.uid()), w.user_id),
         consent_wording = btrim(p_consent),
         consented_at = now()
   where lower(w.email) = v_email
     and w.postcode_area = v_place.postcode_area
     and w.left_at is null
  returning w.id into v_id;

  if v_id is null then
    insert into public.area_waiting_list (postcode, postcode_area, full_name, email, transmission, user_id, consent_wording)
    values (v_place.postcode, v_place.postcode_area, btrim(p_full_name), v_email, p_transmission, (select auth.uid()), btrim(p_consent))
    returning id into v_id;
    perform private.capture_confirm('waiting_list', v_id, v_email);
  end if;

  return jsonb_build_object('postcodeArea', v_place.postcode_area);
end;
$$;

revoke all on function public.join_area_waiting_list(text, text, text, text, public.transmission) from public;
grant execute on function public.join_area_waiting_list(text, text, text, text, public.transmission) to anon, authenticated;

-- Posts a lesson request for an area not yet open, or replaces what an open one from the same
-- address says. Answers the same either way.
create or replace function public.post_lesson_request(
  p_postcode text,
  p_full_name text,
  p_email text,
  p_transmission public.transmission,
  p_experience text,
  p_days smallint[],
  p_times text[],
  p_start_when text,
  p_consent text,
  p_phone text default null,
  p_budget_pence integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_place record;
  v_email text := lower(btrim(p_email));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_days smallint[] := (select coalesce(array_agg(distinct d order by d), '{}') from unnest(p_days) d);
  v_times text[] := (select coalesce(array_agg(distinct t order by t), '{}') from unnest(p_times) t);
  v_id uuid;
begin
  select * into v_place from private.capture_checks(p_postcode, p_email, p_full_name, p_consent);

  begin
    update public.lesson_requests r
       set postcode = v_place.postcode,
           full_name = btrim(p_full_name),
           phone = v_phone,
           transmission = p_transmission,
           experience = p_experience,
           days = v_days,
           times = v_times,
           start_when = p_start_when,
           budget_pence = p_budget_pence,
           user_id = coalesce((select auth.uid()), r.user_id),
           consent_wording = btrim(p_consent),
           consented_at = now()
     where lower(r.email) = v_email
       and r.postcode_area = v_place.postcode_area
       and r.withdrawn_at is null
    returning r.id into v_id;

    if v_id is null then
      insert into public.lesson_requests (
        postcode, postcode_area, full_name, email, phone, transmission, experience, days, times, start_when,
        budget_pence, user_id, consent_wording
      ) values (
        v_place.postcode, v_place.postcode_area, btrim(p_full_name), v_email, v_phone, p_transmission, p_experience, v_days,
        v_times, p_start_when, p_budget_pence, (select auth.uid()), btrim(p_consent)
      )
      returning id into v_id;
      perform private.capture_confirm('lesson_request', v_id, v_email);
    end if;
  exception
    when check_violation then
      raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end;

  return jsonb_build_object('postcodeArea', v_place.postcode_area);
end;
$$;

revoke all on function public.post_lesson_request(text, text, text, public.transmission, text, smallint[], text[], text, text, text, integer) from public;
grant execute on function public.post_lesson_request(text, text, text, public.transmission, text, smallint[], text[], text, text, text, integer)
  to anon, authenticated;

-- The address a token from a confirmation email belongs to.
create or replace function private.capture_email_for(p_token uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select lower(w.email) from public.area_waiting_list w where w.token = p_token),
    (select lower(r.email) from public.lesson_requests r where r.token = p_token)
  );
$$;

-- What is kept for the address a token belongs to: each waiting list place and request, by kind,
-- area and whether it stands. Nothing about the person, since a link can be forwarded. Null for a
-- token that is nobody's.
create or replace function public.learner_capture_by_token(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with owner as (select private.capture_email_for(p_token) as email)
  select case when (select email from owner) is null then null else jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(entry order by entry ->> 'kind' desc, entry ->> 'postcodeArea')
        from (
          select jsonb_build_object('kind', 'waiting_list', 'postcodeArea', w.postcode_area, 'active', w.left_at is null) as entry
            from public.area_waiting_list w, owner where lower(w.email) = owner.email
          union all
          select jsonb_build_object('kind', 'lesson_request', 'postcodeArea', r.postcode_area, 'active', r.withdrawn_at is null)
            from public.lesson_requests r, owner where lower(r.email) = owner.email
        ) entries
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.learner_capture_by_token(uuid) from public;
grant execute on function public.learner_capture_by_token(uuid) to anon, authenticated;

-- Removes everything kept for the address a token belongs to: leaves every waiting list and
-- withdraws every request. Answers how many stood.
create or replace function public.leave_learner_capture(p_token uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := private.capture_email_for(p_token);
  v_left integer;
  v_withdrawn integer;
begin
  if v_email is null then
    return 0;
  end if;
  update public.area_waiting_list set left_at = now() where lower(email) = v_email and left_at is null;
  get diagnostics v_left = row_count;
  update public.lesson_requests set withdrawn_at = now() where lower(email) = v_email and withdrawn_at is null;
  get diagnostics v_withdrawn = row_count;
  return v_left + v_withdrawn;
end;
$$;

revoke all on function public.leave_learner_capture(uuid) from public;
grant execute on function public.leave_learner_capture(uuid) to anon, authenticated;

-- For the job that emails the confirmation: who to write to, the area, and the token for leaving.
-- Nothing once it has been left or withdrawn.
create or replace function public.system_learner_capture_confirmation(p_kind text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_kind
    when 'waiting_list' then (
      select jsonb_build_object('email', w.email, 'fullName', w.full_name, 'postcodeArea', w.postcode_area, 'token', w.token,
                                'sent', w.confirmation_sent_at is not null)
        from public.area_waiting_list w where w.id = p_id and w.left_at is null
    )
    when 'lesson_request' then (
      select jsonb_build_object('email', r.email, 'fullName', r.full_name, 'postcodeArea', r.postcode_area, 'token', r.token,
                                'sent', r.confirmation_sent_at is not null)
        from public.lesson_requests r where r.id = p_id and r.withdrawn_at is null
    )
  end;
$$;

create or replace function public.system_mark_learner_capture_confirmed(p_kind text, p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.area_waiting_list set confirmation_sent_at = coalesce(confirmation_sent_at, now()) where p_kind = 'waiting_list' and id = p_id;
  update public.lesson_requests set confirmation_sent_at = coalesce(confirmation_sent_at, now()) where p_kind = 'lesson_request' and id = p_id;
$$;

revoke all on function private.capture_allowed(text, integer, integer) from public, anon, authenticated;
revoke all on function private.capture_checks(text, text, text, text) from public, anon, authenticated;
revoke all on function private.capture_confirm(text, uuid, text) from public, anon, authenticated;
revoke all on function private.capture_email_for(uuid) from public, anon, authenticated;
revoke all on function public.system_learner_capture_confirmation(text, uuid) from public, anon, authenticated;
revoke all on function public.system_mark_learner_capture_confirmed(text, uuid) from public, anon, authenticated;
grant execute on function public.system_learner_capture_confirmation(text, uuid) to service_role;
grant execute on function public.system_mark_learner_capture_confirmed(text, uuid) to service_role;
