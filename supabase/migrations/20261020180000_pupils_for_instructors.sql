-- Finding a new pupil an instructor (M9-17, M9-18, D-289).
--
-- The school offers a new pupil to one or more of the instructors linked to it, for a day or so:
-- the first to accept gets them, the rest of the offers are withdrawn, and an offer nobody answers
-- lapses, putting the pupil back in New. A linked instructor sees an offer as a first name, a
-- postcode district, a gearbox and when suits; who they are, and how to reach them, only once they
-- accept. Or the school gives the pupil to one of its own instructors, with the suggestions it
-- already makes for a learner (SCH-03), and they become the school's learner at once.

create type public.enquiry_offer_status as enum ('open', 'accepted', 'declined', 'lapsed', 'withdrawn');

create table public.school_enquiry_offers (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.school_enquiries (id) on delete cascade,
  school_id uuid not null references public.businesses (id) on delete cascade,
  link_id uuid not null references public.school_links (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  status public.enquiry_offer_status not null default 'open',
  expires_at timestamptz not null,
  answered_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint school_enquiry_offers_once unique (enquiry_id, business_id)
);

create index school_enquiry_offers_open on public.school_enquiry_offers (business_id, status, expires_at);
create index school_enquiry_offers_enquiry on public.school_enquiry_offers (enquiry_id);

comment on table public.school_enquiry_offers is
  'A new pupil offered to an instructor linked to the school: the first to accept gets them (D-289).';

alter table public.school_enquiry_offers enable row level security;

create policy school_enquiry_offers_read on public.school_enquiry_offers
  for select to authenticated
  using (
    private.auth_has_role(school_id, array['owner', 'manager']::public.membership_role[])
    or private.auth_has_role(business_id, array['owner']::public.membership_role[])
  );

grant select on public.school_enquiry_offers to authenticated;

-- ---------------------------------------------------------------------------------------
-- Withdrawing the open offers on an enquiry, and putting it back in New when none is left.
-- ---------------------------------------------------------------------------------------
create function private.withdraw_enquiry_offers(p_enquiry_id uuid, p_but_not uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.school_enquiry_offers
     set status = 'withdrawn', answered_at = now()
   where enquiry_id = p_enquiry_id
     and status = 'open'
     and id is distinct from p_but_not;
$$;

create function private.enquiry_back_to_new_if_unoffered(p_enquiry_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.school_enquiries e
     set status = 'new'
   where e.id = p_enquiry_id
     and e.status = 'offered'
     and not exists (select 1 from public.school_enquiry_offers o where o.enquiry_id = e.id and o.status = 'open');
$$;

revoke all on function private.withdraw_enquiry_offers(uuid, uuid) from public, anon, authenticated;
revoke all on function private.enquiry_back_to_new_if_unoffered(uuid) from public, anon, authenticated;

-- An instructor no longer linked has nothing open from the school.
create function private.withdraw_offers_when_unlinked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry uuid;
begin
  for v_enquiry in
    update public.school_enquiry_offers
       set status = 'withdrawn', answered_at = now()
     where link_id = new.id and status = 'open'
    returning enquiry_id
  loop
    perform private.enquiry_back_to_new_if_unoffered(v_enquiry);
  end loop;
  return new;
end;
$$;

create trigger school_links_withdraw_offers
  after update of status on public.school_links
  for each row when (new.status = 'ended' and old.status = 'active')
  execute function private.withdraw_offers_when_unlinked();

-- ---------------------------------------------------------------------------------------
-- offer_school_enquiry: the school offers a new pupil to instructors linked to it.
-- ---------------------------------------------------------------------------------------
create function public.offer_school_enquiry(p_enquiry_id uuid, p_link_ids uuid[], p_hours integer default 24)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry public.school_enquiries;
  v_link public.school_links;
  v_link_id uuid;
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
  if v_enquiry.status not in ('new', 'offered') then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_open"}';
  end if;
  if p_link_ids is null or cardinality(p_link_ids) not between 1 and 30 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "links"}';
  end if;
  if p_hours is null or p_hours not between 1 and 168 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "hours"}';
  end if;

  foreach v_link_id in array p_link_ids loop
    select * into v_link from public.school_links where id = v_link_id;
    if v_link.id is null or v_link.school_id <> v_enquiry.school_id or v_link.status <> 'active' then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "links", "reason": "not_linked"}';
    end if;
    insert into public.school_enquiry_offers (enquiry_id, school_id, link_id, business_id, expires_at, created_by)
    values (v_enquiry.id, v_enquiry.school_id, v_link.id, v_link.business_id, now() + make_interval(hours => p_hours), (select auth.uid()))
    on conflict on constraint school_enquiry_offers_once do update
      set status = 'open',
          link_id = excluded.link_id,
          expires_at = excluded.expires_at,
          answered_at = null,
          created_by = excluded.created_by,
          created_at = now()
      where school_enquiry_offers.status <> 'accepted';
  end loop;

  update public.school_enquiries set status = 'offered' where id = v_enquiry.id;

  perform private.write_audit('school.enquiry_offered', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
    jsonb_build_object('status', v_enquiry.status),
    jsonb_build_object('status', 'offered', 'instructors', cardinality(p_link_ids), 'hours', p_hours));
end;
$$;

revoke all on function public.offer_school_enquiry(uuid, uuid[], integer) from public, anon;
grant execute on function public.offer_school_enquiry(uuid, uuid[], integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- answer_enquiry_offer: the linked instructor accepts or declines. The enquiry is locked first,
-- so two accepting at once are answered one after the other, and only the first gets the pupil.
-- ---------------------------------------------------------------------------------------
create function public.answer_enquiry_offer(p_offer_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.school_enquiry_offers;
  v_enquiry public.school_enquiries;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_offer from public.school_enquiry_offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_role(v_offer.business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "accept"}';
  end if;

  select * into v_enquiry from public.school_enquiries where id = v_offer.enquiry_id for update;
  select * into v_offer from public.school_enquiry_offers where id = p_offer_id for update;

  if v_offer.status = 'open' and v_offer.expires_at <= now() then
    update public.school_enquiry_offers set status = 'lapsed', answered_at = now() where id = v_offer.id;
    perform private.enquiry_back_to_new_if_unoffered(v_enquiry.id);
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "lapsed"}';
  end if;
  if v_offer.status <> 'open' then
    raise exception 'VALIDATION_FAILED'
      using detail = jsonb_build_object('reason', case
        when v_enquiry.status = 'taken' then 'taken'
        when v_offer.status = 'lapsed' then 'lapsed'
        when v_offer.status = 'withdrawn' then 'withdrawn'
        else 'answered'
      end)::text;
  end if;
  if not exists (select 1 from public.school_links l where l.id = v_offer.link_id and l.status = 'active') then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_linked"}';
  end if;

  if p_accept then
    update public.school_enquiry_offers set status = 'accepted', answered_at = now() where id = v_offer.id;
    perform private.withdraw_enquiry_offers(v_enquiry.id, v_offer.id);
    update public.school_enquiries
       set status = 'taken', taken_business_id = v_offer.business_id, taken_at = now()
     where id = v_enquiry.id;
    perform private.write_audit('school.enquiry_taken', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
      jsonb_build_object('status', v_enquiry.status), jsonb_build_object('status', 'taken', 'business_id', v_offer.business_id));
  else
    update public.school_enquiry_offers set status = 'declined', answered_at = now() where id = v_offer.id;
    perform private.enquiry_back_to_new_if_unoffered(v_enquiry.id);
    perform private.write_audit('school.enquiry_offer_declined', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
      null, jsonb_build_object('business_id', v_offer.business_id));
  end if;
end;
$$;

revoke all on function public.answer_enquiry_offer(uuid, boolean) from public, anon;
grant execute on function public.answer_enquiry_offer(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------
-- pupil_offers_for: what a linked instructor's Business has been offered, and taken. Before they
-- accept, a first name, the postcode district, the gearbox and when suits; after, all of it.
-- ---------------------------------------------------------------------------------------
create function public.pupil_offers_for(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'offerId', o.id,
             'enquiryId', e.id,
             'status', o.status,
             'schoolName', s.name,
             'offeredAt', o.created_at,
             'expiresAt', o.expires_at,
             'firstName', split_part(btrim(e.full_name), ' ', 1),
             'district', split_part(e.postcode, ' ', 1),
             'transmission', e.transmission,
             'note', e.note,
             'fullName', case when o.status = 'accepted' then e.full_name end,
             'email', case when o.status = 'accepted' then e.email end,
             'phone', case when o.status = 'accepted' then e.phone end,
             'postcode', case when o.status = 'accepted' then e.postcode end,
             'learnerAdded', o.status = 'accepted' and e.taken_learner_id is not null
           ) order by o.status <> 'open', o.created_at desc)
      from public.school_enquiry_offers o
      join public.school_enquiries e on e.id = o.enquiry_id
      join public.businesses s on s.id = o.school_id
     where o.business_id = p_business_id
       and (
         (o.status = 'open' and o.expires_at > now())
         or (o.status = 'accepted' and e.status = 'taken' and e.taken_business_id = p_business_id)
       )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pupil_offers_for(uuid) from public, anon;
grant execute on function public.pupil_offers_for(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- system_lapse_enquiry_offers: offers nobody answered in time lapse, and their pupils go back to
-- New. Every ten minutes, on pg_cron.
-- ---------------------------------------------------------------------------------------
create function public.system_lapse_enquiry_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry uuid;
  v_count integer := 0;
begin
  for v_enquiry in
    update public.school_enquiry_offers
       set status = 'lapsed', answered_at = now()
     where status = 'open' and expires_at <= now()
    returning enquiry_id
  loop
    v_count := v_count + 1;
    perform private.enquiry_back_to_new_if_unoffered(v_enquiry);
  end loop;
  return v_count;
end;
$$;

revoke all on function public.system_lapse_enquiry_offers() from public, anon, authenticated;
grant execute on function public.system_lapse_enquiry_offers() to service_role;

select cron.schedule('lapse-enquiry-offers', '*/10 * * * *', $$select public.system_lapse_enquiry_offers()$$);

-- ---------------------------------------------------------------------------------------
-- Closing an enquiry withdraws what is open on it.
-- ---------------------------------------------------------------------------------------
create or replace function public.close_school_enquiry(p_enquiry_id uuid, p_reason text default null)
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

  perform private.withdraw_enquiry_offers(v_enquiry.id);
  update public.school_enquiries
     set status = 'closed', closed_at = now(), closed_reason = v_reason
   where id = v_enquiry.id;

  perform private.write_audit('school.enquiry_closed', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
    jsonb_build_object('status', v_enquiry.status), jsonb_build_object('status', 'closed', 'reason', v_reason));
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Who at the school could teach a new pupil, with the facts the suggestions are made from.
-- ---------------------------------------------------------------------------------------
create function private.enquiry_allocation_facts(p_business_id uuid, p_enquiry_id uuid, p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with learner as (
    -- The enquiry stands in for the learner: their gearbox, and where their postcode is.
    select e.transmission,
           pc.location,
           coalesce(pc.outcode, nullif(split_part(e.postcode, ' ', 1), '')) as outcode
      from public.school_enquiries e
      left join public.postcodes pc on pc.postcode = e.postcode
     where e.id = p_enquiry_id
  ),
  window_range as (
    select tstzrange(p_now, p_now + interval '14 days', '[)') as period,
           (p_now at time zone 'Europe/London')::date as first_day,
           ((p_now + interval '14 days') at time zone 'Europe/London')::date as last_day
  ),
  days as (
    select day::date as day
      from window_range w
      cross join generate_series(w.first_day, w.last_day, interval '1 day') as day
  ),
  team as (
    select p.id, p.display_name, p.transmission, p.base_location, p.radius_miles, p.verification_status, p.badge_expiry
      from public.instructor_profiles p
      join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
     where p.business_id = p_business_id
  ),
  times as (
    select t.id,
           ((
              coalesce((
                select range_agg(open_range.period)
                  from (
                    select tstzrange((d.day + wh.start_time) at time zone 'Europe/London',
                                     (d.day + wh.end_time) at time zone 'Europe/London', '[)') as period
                      from days d
                      join public.working_hours wh on wh.instructor_id = t.id and wh.weekday = extract(isodow from d.day)
                    union all
                    select e.period
                      from public.availability_exceptions e
                     where e.instructor_id = t.id and e.kind = 'open' and e.period && w.period
                  ) as open_range
              ), '{}'::tstzmultirange)
              - coalesce((
                  select range_agg(e.period)
                    from public.availability_exceptions e
                   where e.instructor_id = t.id and e.kind = 'blocked' and e.period && w.period
                ), '{}'::tstzmultirange)
            ) * tstzmultirange(w.period)) as open_time,
           coalesce((
             select range_agg(b.blocked_range)
               from public.bookings b
              where b.instructor_id = t.id
                and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress')
                and (b.status <> 'requested' or b.expires_at > p_now)
                and b.blocked_range && w.period
           ), '{}'::tstzmultirange) as taken_time
      from team t
      cross join window_range w
  )
  select jsonb_build_object(
    'learner', (select jsonb_build_object('transmission', l.transmission, 'outcode', l.outcode) from learner l),
    'instructors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'instructor_id', t.id,
               'name', t.display_name,
               'badge', case
                          when t.verification_status <> 'approved' then 'unchecked'
                          when t.badge_expiry is not null and t.badge_expiry < (p_now at time zone 'Europe/London')::date then 'expired'
                          else 'checked'
                        end,
               'transmission', t.transmission,
               'distance_miles', (
                 select round((extensions.st_distance(l.location, t.base_location) / 1609.344)::numeric, 2)
                   from learner l
                  where l.location is not null and t.base_location is not null
               ),
               'radius_miles', t.radius_miles,
               'open_minutes', (select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60 from unnest(x.open_time) as r)::integer,
               'free_minutes', (select coalesce(sum(extract(epoch from upper(r) - lower(r))), 0) / 60 from unnest(x.open_time - x.taken_time) as r)::integer
             ) order by t.display_name, t.id)
        from team t
        join times x on x.id = t.id
    ), '[]'::jsonb)
  );
$$;
revoke all on function private.enquiry_allocation_facts(uuid, uuid, timestamptz) from public, anon, authenticated;

create function public.enquiry_allocation(p_enquiry_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select e.school_id into v_school from public.school_enquiries e where e.id = p_enquiry_id;
  if v_school is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(v_school, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return private.enquiry_allocation_facts(v_school, p_enquiry_id, now());
end;
$$;

revoke all on function public.enquiry_allocation(uuid) from public, anon;
grant execute on function public.enquiry_allocation(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- give_school_enquiry: the school gives a new pupil to one of its own instructors. The app has
-- just made the account they will claim (D-068); this makes them the school's learner with that
-- instructor, withdraws any offers, and marks the enquiry taken, all at once.
-- ---------------------------------------------------------------------------------------
create function public.give_school_enquiry(p_enquiry_id uuid, p_instructor_id uuid, p_learner_id uuid)
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
  if not private.auth_has_permission(v_enquiry.school_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_enquiry.status not in ('new', 'offered') then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_open"}';
  end if;
  if not exists (
    select 1
      from public.instructor_profiles p
      join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
     where p.id = p_instructor_id and p.business_id = v_enquiry.school_id
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "instructor"}';
  end if;

  perform public.add_learner(p_instructor_id, p_learner_id, v_enquiry.postcode, v_enquiry.transmission::text, 'manual');
  perform private.withdraw_enquiry_offers(v_enquiry.id);
  update public.school_enquiries
     set status = 'taken',
         taken_business_id = v_enquiry.school_id,
         taken_instructor_id = p_instructor_id,
         taken_learner_id = p_learner_id,
         taken_at = now()
   where id = v_enquiry.id;

  perform private.write_audit('school.enquiry_given', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
    jsonb_build_object('status', v_enquiry.status), jsonb_build_object('status', 'taken', 'instructor_id', p_instructor_id));
end;
$$;

revoke all on function public.give_school_enquiry(uuid, uuid, uuid) from public, anon;
grant execute on function public.give_school_enquiry(uuid, uuid, uuid) to authenticated;
