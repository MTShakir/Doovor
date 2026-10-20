-- What a linked instructor pays the school that sends them pupils, and the record of it
-- (M9-11, M9-12, D-287).
--
-- A school charges each linked instructor a fee every week or every month, from a date it chooses,
-- perhaps after some free weeks, and may charge a fee for each pupil it introduces (D-278). The
-- platform keeps the record: each fee falls due on its schedule, raised by a job inside the
-- database, and is owed until the school marks it paid or writes it off. Nothing here moves money:
-- collecting fees waits for the accountant and the solicitor (M9-14).

create type public.school_fee_period as enum ('weekly', 'monthly');
create type public.school_fee_status as enum ('owed', 'paid', 'written_off');

-- ---------------------------------------------------------------------------------------
-- The terms, one set for each link.
-- ---------------------------------------------------------------------------------------
alter table public.school_links
  add column fee_period public.school_fee_period,
  add column fee_pence integer constraint school_links_fee_range check (fee_pence between 100 and 200000),
  -- The date the arrangement starts; the first fee falls due after any free weeks.
  add column fees_start_on date,
  add column free_weeks integer not null default 0 constraint school_links_free_weeks_range check (free_weeks between 0 and 52),
  add column pupil_fee_pence integer constraint school_links_pupil_fee_range check (pupil_fee_pence between 100 and 50000),
  add constraint school_links_fee_whole check (
    (fee_period is null) = (fee_pence is null) and (fee_period is null) = (fees_start_on is null)
  );

comment on column public.school_links.fee_period is 'How often the linked instructor pays the school a fee; null when there is none (D-287).';
comment on column public.school_links.pupil_fee_pence is 'What the school charges for each pupil it introduces, due when their first lesson is booked (D-287).';

-- ---------------------------------------------------------------------------------------
-- The fees themselves.
-- ---------------------------------------------------------------------------------------
create table public.school_fees (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.school_links (id) on delete cascade,
  school_id uuid not null references public.businesses (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('period', 'pupil')),
  -- A week or a month of the arrangement, for a fee of that kind.
  period_starts_on date,
  period_ends_on date,
  -- The pupil, for a fee for introducing one (M9-20).
  learner_id uuid references public.users (id) on delete set null,
  amount_pence integer not null check (amount_pence > 0),
  due_on date not null,
  status public.school_fee_status not null default 'owed',
  settled_at timestamptz,
  settled_by uuid references public.users (id) on delete set null,
  -- How it was paid, in the school's words, when it was paid outside the platform.
  settled_note text check (char_length(settled_note) <= 200),
  created_at timestamptz not null default now(),
  constraint school_fees_period_whole check (
    (kind = 'period') = (period_starts_on is not null and period_ends_on is not null and period_ends_on >= period_starts_on)
  ),
  constraint school_fees_settled check ((status = 'owed') = (settled_at is null))
);

create unique index school_fees_one_per_period on public.school_fees (link_id, period_starts_on) where kind = 'period';
create index school_fees_school on public.school_fees (school_id, due_on desc);
create index school_fees_business on public.school_fees (business_id, due_on desc);

comment on table public.school_fees is
  'Fees a linked instructor owes the school, raised on the link''s schedule; a record only, nothing is collected here (D-287).';

alter table public.school_fees enable row level security;

-- The school that is owed them, and the instructor who owes them. Written only by the functions.
create policy school_fees_read on public.school_fees
  for select to authenticated
  using (
    private.auth_has_role(school_id, array['owner', 'manager']::public.membership_role[])
    or private.auth_has_role(business_id, array['owner']::public.membership_role[])
  );

grant select on public.school_fees to authenticated;

-- ---------------------------------------------------------------------------------------
-- set_school_fee_terms: what a linked instructor pays, set by the school. A change of amount
-- applies from the next fee. A new start, or a change between weekly and monthly, starts a new
-- schedule, which may not begin before today nor overlap a fee already raised.
-- ---------------------------------------------------------------------------------------
create function public.set_school_fee_terms(
  p_link_id uuid,
  p_period public.school_fee_period default null,
  p_fee_pence integer default null,
  p_starts_on date default null,
  p_free_weeks integer default 0,
  p_pupil_fee_pence integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.school_links;
  v_last_end date;
  v_anchor date;
  v_old_anchor date;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_link from public.school_links where id = p_link_id for update;
  if v_link.id is null or v_link.status <> 'active' then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(v_link.school_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  if p_period is null then
    if p_fee_pence is not null or p_starts_on is not null then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "period"}';
    end if;
  else
    if p_fee_pence is null or p_fee_pence not between 100 and 200000 then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "fee"}';
    end if;
    if p_starts_on is null then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "startsOn"}';
    end if;
  end if;
  if p_free_weeks is null or p_free_weeks not between 0 and 52 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "freeWeeks"}';
  end if;
  if p_pupil_fee_pence is not null and p_pupil_fee_pence not between 100 and 50000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "pupilFee"}';
  end if;

  -- A schedule that changes begins afresh: not in the past, and after every fee already raised.
  v_anchor := p_starts_on + coalesce(p_free_weeks, 0) * 7;
  v_old_anchor := v_link.fees_start_on + v_link.free_weeks * 7;
  if p_period is not null and (v_link.fee_period is distinct from p_period or v_anchor is distinct from v_old_anchor) then
    if p_starts_on < private.today() then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "startsOn", "reason": "in_past"}';
    end if;
    select max(f.period_ends_on) into v_last_end
      from public.school_fees f
     where f.link_id = v_link.id and f.kind = 'period';
    if v_last_end is not null and v_anchor <= v_last_end then
      raise exception 'VALIDATION_FAILED'
        using detail = jsonb_build_object('field', 'startsOn', 'reason', 'overlaps_last_fee', 'after', v_last_end)::text;
    end if;
  end if;

  update public.school_links
     set fee_period = p_period,
         fee_pence = p_fee_pence,
         fees_start_on = p_starts_on,
         free_weeks = coalesce(p_free_weeks, 0),
         pupil_fee_pence = p_pupil_fee_pence,
         updated_at = now()
   where id = v_link.id;

  perform private.write_audit('school.fee_terms_set', 'school_link', v_link.id, v_link.school_id,
    jsonb_build_object('period', v_link.fee_period, 'fee_pence', v_link.fee_pence, 'starts_on', v_link.fees_start_on,
                       'free_weeks', v_link.free_weeks, 'pupil_fee_pence', v_link.pupil_fee_pence),
    jsonb_build_object('period', p_period, 'fee_pence', p_fee_pence, 'starts_on', p_starts_on,
                       'free_weeks', coalesce(p_free_weeks, 0), 'pupil_fee_pence', p_pupil_fee_pence));
end;
$$;

revoke all on function public.set_school_fee_terms(uuid, public.school_fee_period, integer, date, integer, integer) from public, anon;
grant execute on function public.set_school_fee_terms(uuid, public.school_fee_period, integer, date, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- system_raise_school_fees: every week or month of each link's schedule that has begun gets its
-- fee, once, at the amount the terms say when it is raised. Nothing is raised for a week or month
-- that begins after the link ended. Run by pg_cron every hour, so a late run catches up.
-- ---------------------------------------------------------------------------------------
create function public.system_raise_school_fees(p_today date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := coalesce(p_today, private.today());
  v_link public.school_links;
  v_anchor date;
  v_last date;
  v_start date;
  v_end date;
  v_ended date;
  v_n integer;
  v_made integer := 0;
  v_count integer;
begin
  for v_link in
    select * from public.school_links l
     where l.fee_period is not null
       and l.fees_start_on + l.free_weeks * 7 <= v_today
  loop
    v_anchor := v_link.fees_start_on + v_link.free_weeks * 7;
    v_ended := case when v_link.ended_at is null then null else (v_link.ended_at at time zone 'Europe/London')::date end;
    select max(f.period_starts_on) into v_last
      from public.school_fees f
     where f.link_id = v_link.id and f.kind = 'period';
    v_n := 0;
    loop
      if v_link.fee_period = 'weekly' then
        v_start := v_anchor + v_n * 7;
        v_end := v_start + 6;
      else
        v_start := (v_anchor + make_interval(months => v_n))::date;
        v_end := (v_anchor + make_interval(months => v_n + 1))::date - 1;
      end if;
      exit when v_start > v_today;
      exit when v_ended is not null and v_start >= v_ended;
      if v_last is null or v_start > v_last then
        insert into public.school_fees (link_id, school_id, business_id, kind, period_starts_on, period_ends_on, amount_pence, due_on)
        values (v_link.id, v_link.school_id, v_link.business_id, 'period', v_start, v_end, v_link.fee_pence, v_start)
        on conflict do nothing;
        get diagnostics v_count = row_count;
        v_made := v_made + v_count;
      end if;
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_made;
end;
$$;

revoke all on function public.system_raise_school_fees(date) from public, anon, authenticated;
grant execute on function public.system_raise_school_fees(date) to service_role;

select cron.schedule('raise-school-fees', '7 * * * *', $$select public.system_raise_school_fees()$$);

-- ---------------------------------------------------------------------------------------
-- settle_school_fee: the school marks a fee paid outside the platform or writes it off, or puts
-- it back to owed when that was a mistake.
-- ---------------------------------------------------------------------------------------
create function public.settle_school_fee(p_fee_id uuid, p_outcome public.school_fee_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee public.school_fees;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_fee from public.school_fees where id = p_fee_id for update;
  if v_fee.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(v_fee.school_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_outcome is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "outcome"}';
  end if;
  if char_length(v_note) > 200 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "note"}';
  end if;
  if v_fee.status = p_outcome then
    return;
  end if;

  update public.school_fees
     set status = p_outcome,
         settled_at = case when p_outcome = 'owed' then null else now() end,
         settled_by = case when p_outcome = 'owed' then null else (select auth.uid()) end,
         settled_note = case when p_outcome = 'owed' then null else v_note end
   where id = v_fee.id;

  perform private.write_audit('school.fee_settled', 'school_fee', v_fee.id, v_fee.school_id,
    jsonb_build_object('status', v_fee.status, 'note', v_fee.settled_note),
    jsonb_build_object('status', p_outcome, 'note', case when p_outcome = 'owed' then null else v_note end));
end;
$$;

revoke all on function public.settle_school_fee(uuid, public.school_fee_status, text) from public, anon;
grant execute on function public.settle_school_fee(uuid, public.school_fee_status, text) to authenticated;
