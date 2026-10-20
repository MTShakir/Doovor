-- What a school pays the instructors who teach under it, and a weekly statement of it (M9-21,
-- M9-22, D-291).
--
-- A school that sells its lessons pays each instructor teaching under it either a rate for every
-- hour taught or a share of each lesson's price. The platform works the pay out from the lessons
-- and says it each week, to the school and to the instructor; it pays nobody (D-278: the school
-- never holds learners' money for its instructors here, and pays them itself).
--
-- Pay is kept apart from memberships, because a school's managers read its memberships, and only
-- the owner, a manager allowed to see revenue, and the instructor themselves read their pay. Each
-- change starts on a Monday and is kept, so a week already paid always says what it said.

create table public.member_pay (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  -- From this Monday on; a null basis is no pay set from then.
  effective_from date not null check (extract(isodow from effective_from) = 1),
  basis text check (basis in ('hourly', 'share')),
  hourly_pence integer check (hourly_pence between 100 and 20000),
  share_percent integer check (share_percent between 1 and 100),
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint member_pay_once_a_week unique (membership_id, effective_from),
  constraint member_pay_whole check (
    case basis
      when 'hourly' then hourly_pence is not null and share_percent is null
      when 'share' then share_percent is not null and hourly_pence is null
      else hourly_pence is null and share_percent is null
    end
  )
);

comment on table public.member_pay is
  'What a school pays an instructor teaching under it, a rate an hour or a share of each lesson, from a Monday on (D-291).';

alter table public.member_pay enable row level security;

create policy member_pay_read on public.member_pay
  for select to authenticated
  using (private.auth_has_permission(business_id, 'view_revenue') or user_id = (select auth.uid()));

grant select on public.member_pay to authenticated;

-- ---------------------------------------------------------------------------------------
-- set_member_pay: the owner, or a manager allowed to see revenue, says what an instructor at the
-- school is paid from a Monday on, this week's unless they say an earlier one, or that nothing is
-- set from then.
-- ---------------------------------------------------------------------------------------
create function public.set_member_pay(
  p_membership_id uuid,
  p_basis text default null,
  p_hourly_pence integer default null,
  p_share_percent integer default null,
  p_from date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.memberships;
  v_this_week date := private.today() - (extract(isodow from private.today())::integer - 1);
  v_from date := coalesce(p_from, private.today() - (extract(isodow from private.today())::integer - 1));
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select m.* into v_member
    from public.memberships m
    join public.businesses b on b.id = m.business_id and b.type = 'school'
   where m.id = p_membership_id and m.role = 'instructor';
  if v_member.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(v_member.business_id, 'view_revenue') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_basis is not null and p_basis not in ('hourly', 'share') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "basis"}';
  end if;
  if p_basis = 'hourly' and (p_hourly_pence is null or p_hourly_pence not between 100 and 20000) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "hourly"}';
  end if;
  if p_basis = 'share' and (p_share_percent is null or p_share_percent not between 1 and 100) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "share"}';
  end if;
  -- A Monday, from a year ago to next week: pay is said for weeks being taught, not far ahead.
  if extract(isodow from v_from) <> 1 or v_from < v_this_week - 364 or v_from > v_this_week + 7 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "from"}';
  end if;

  insert into public.member_pay (membership_id, business_id, user_id, effective_from, basis, hourly_pence, share_percent, updated_by)
  values (v_member.id, v_member.business_id, v_member.user_id, v_from, p_basis,
          case when p_basis = 'hourly' then p_hourly_pence end,
          case when p_basis = 'share' then p_share_percent end,
          (select auth.uid()))
  on conflict on constraint member_pay_once_a_week do update
    set basis = excluded.basis,
        hourly_pence = excluded.hourly_pence,
        share_percent = excluded.share_percent,
        updated_by = excluded.updated_by,
        created_at = now();

  perform private.write_audit('school.member_pay_set', 'membership', v_member.id, v_member.business_id, null,
    jsonb_build_object('basis', p_basis, 'hourly_pence', p_hourly_pence, 'share_percent', p_share_percent, 'from', v_from));
end;
$$;

revoke all on function public.set_member_pay(uuid, text, integer, integer, date) from public, anon;
grant execute on function public.set_member_pay(uuid, text, integer, integer, date) to authenticated;

-- The pay in force for an instructor on a day: the latest change on or before it.
create function private.member_pay_on(p_membership_id uuid, p_day date)
returns public.member_pay
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
    from public.member_pay p
   where p.membership_id = p_membership_id and p.effective_from <= p_day
   order by p.effective_from desc
   limit 1;
$$;

revoke all on function private.member_pay_on(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- member_pay_statement: a week of lessons taught under the school, Monday to Sunday in the UK,
-- with each lesson's pay at the rate in force that week. The school's owner, or a manager allowed
-- to see revenue, reads everybody; an instructor reads their own. A lesson counts once it has ended
-- and was not called off.
-- ---------------------------------------------------------------------------------------
create function public.member_pay_statement(p_business_id uuid, p_week_start date, p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_everybody boolean;
  v_from timestamptz;
  v_to timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  v_everybody := private.auth_has_permission(p_business_id, 'view_revenue');
  if not v_everybody and (p_user_id is distinct from v_user
       or not exists (select 1 from public.memberships m where m.business_id = p_business_id and m.user_id = v_user)) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "week"}';
  end if;

  v_from := (p_week_start::timestamp) at time zone 'Europe/London';
  v_to := ((p_week_start + 7)::timestamp) at time zone 'Europe/London';

  return jsonb_build_object(
    'weekStart', p_week_start,
    'members', coalesce((
      select jsonb_agg(member order by member ->> 'name', member ->> 'membershipId')
        from (
          select jsonb_build_object(
                   'membershipId', m.id,
                   'instructorId', p.id,
                   'name', p.display_name,
                   'active', m.status = 'active',
                   -- The pay in force that week, and what it is now, for changing it.
                   'basis', week_pay.basis,
                   'hourlyPence', week_pay.hourly_pence,
                   'sharePercent', week_pay.share_percent,
                   'nowBasis', now_pay.basis,
                   'nowHourlyPence', now_pay.hourly_pence,
                   'nowSharePercent', now_pay.share_percent,
                   'lessons', coalesce(lessons.list, '[]'::jsonb),
                   'minutes', coalesce(lessons.minutes, 0),
                   'pricePence', coalesce(lessons.price, 0),
                   'payPence', case when week_pay.basis is null then null else coalesce(lessons.pay, 0) end
                 ) as member
            from public.memberships m
            join public.instructor_profiles p on p.business_id = m.business_id and p.user_id = m.user_id
            left join lateral (select * from private.member_pay_on(m.id, p_week_start)) as week_pay on true
            left join lateral (select * from private.member_pay_on(m.id, private.today())) as now_pay on true
            left join lateral (
              select jsonb_agg(jsonb_build_object(
                       'bookingId', x.id,
                       'startsAt', x.starts_at,
                       'minutes', x.minutes,
                       'pricePence', x.price_pence,
                       'payPence', x.pay,
                       'learnerName', x.learner_name,
                       'status', x.status
                     ) order by x.starts_at) as list,
                     sum(x.minutes)::integer as minutes,
                     sum(x.price_pence)::integer as price,
                     sum(x.pay)::integer as pay
                from (
                  select bk.id, bk.starts_at, bk.status, bk.price_pence,
                         (extract(epoch from bk.ends_at - bk.starts_at) / 60)::integer as minutes,
                         coalesce(nullif(btrim(u.full_name), ''), 'A learner') as learner_name,
                         case week_pay.basis
                           when 'hourly' then round((extract(epoch from bk.ends_at - bk.starts_at) / 3600) * week_pay.hourly_pence)::integer
                           when 'share' then round(bk.price_pence * week_pay.share_percent / 100.0)::integer
                         end as pay
                    from public.bookings bk
                    left join public.users u on u.id = bk.learner_id
                   where bk.instructor_id = p.id
                     and bk.business_id = p_business_id
                     and bk.status in ('confirmed', 'in_progress', 'completed', 'no_show')
                     and bk.starts_at >= v_from
                     and bk.starts_at < v_to
                     and bk.ends_at <= now()
                ) as x
            ) as lessons on true
           where m.business_id = p_business_id
             and m.role = 'instructor'
             and (p_user_id is null or m.user_id = p_user_id)
             and (m.status = 'active' or lessons.list is not null)
        ) as members
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.member_pay_statement(uuid, date, uuid) from public, anon;
grant execute on function public.member_pay_statement(uuid, date, uuid) to authenticated;
