-- What a school recommends its linked instructors charge, and the most it lets them (M9-10, D-286).
--
-- A linked instructor sells their own lessons (D-282), so their prices are theirs. The law lets a
-- school recommend a price, or set the most an instructor may charge, but never fix a price or set
-- a lowest one (VABEO 2022, article 8), so there is nothing here that could: a recommended price
-- an hour, which is only shown, and a highest price an hour, which the database holds a linked
-- instructor's prices to when they change them.

alter table public.businesses
  add column linked_recommended_hourly_pence integer
    constraint businesses_linked_recommended_range check (linked_recommended_hourly_pence between 500 and 100000),
  add column linked_max_hourly_pence integer
    constraint businesses_linked_max_range check (linked_max_hourly_pence between 500 and 100000),
  add constraint businesses_linked_recommended_within_max check (
    linked_recommended_hourly_pence is null or linked_max_hourly_pence is null
    or linked_recommended_hourly_pence <= linked_max_hourly_pence
  );

comment on column public.businesses.linked_recommended_hourly_pence is
  'A school''s suggested price an hour for its linked instructors. Only shown: never a fixed or lowest price (D-286).';
comment on column public.businesses.linked_max_hourly_pence is
  'The most a school''s linked instructors may charge an hour for a lesson or a package (D-286).';

grant select (linked_recommended_hourly_pence, linked_max_hourly_pence) on public.businesses to authenticated;

-- ---------------------------------------------------------------------------------------
-- Setting them: whoever may set the school's own prices.
-- ---------------------------------------------------------------------------------------
-- Either left out is none.
create function public.set_linked_price_guide(
  p_school_id uuid,
  p_recommended_hourly_pence integer default null,
  p_max_hourly_pence integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_school_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_school_id, 'set_prices') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_recommended_hourly_pence is not null and p_recommended_hourly_pence not between 500 and 100000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "recommended"}';
  end if;
  if p_max_hourly_pence is not null and p_max_hourly_pence not between 500 and 100000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "maximum"}';
  end if;
  if p_recommended_hourly_pence > p_max_hourly_pence then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "recommended", "reason": "above_maximum"}';
  end if;

  select jsonb_build_object('recommended', b.linked_recommended_hourly_pence, 'maximum', b.linked_max_hourly_pence)
    into v_before
    from public.businesses b
   where b.id = p_school_id;

  update public.businesses
     set linked_recommended_hourly_pence = p_recommended_hourly_pence,
         linked_max_hourly_pence = p_max_hourly_pence
   where id = p_school_id;

  perform private.write_audit('school.price_guide_set', 'business', p_school_id, p_school_id, v_before,
    jsonb_build_object('recommended', p_recommended_hourly_pence, 'maximum', p_max_hourly_pence));
end;
$$;

revoke all on function public.set_linked_price_guide(uuid, integer, integer) from public, anon;
grant execute on function public.set_linked_price_guide(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Holding a linked instructor's prices to the most: a lesson's, and a package's an hour. A price
-- that does not change is left alone, so a price set before the school set its most, or before
-- the instructor linked, stays until they change it, and taking a package off sale always works.
-- ---------------------------------------------------------------------------------------
create function private.hold_to_school_price_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer;
  v_school text;
  v_minutes integer;
begin
  if tg_table_name = 'lesson_prices' then
    v_minutes := new.duration_minutes;
    if tg_op = 'UPDATE' and new.price_pence = old.price_pence and new.duration_minutes = old.duration_minutes then
      return new;
    end if;
    -- Saving prices inserts each one and updates it on conflict, and this runs before the insert
    -- finds the conflict: a price already there, unchanged, is not a change.
    if tg_op = 'INSERT' and exists (
      select 1
        from public.lesson_prices lp
       where lp.lesson_type_id = new.lesson_type_id
         and lp.instructor_id is not distinct from new.instructor_id
         and lp.duration_minutes = new.duration_minutes
         and lp.price_pence = new.price_pence
    ) then
      return new;
    end if;
  else
    v_minutes := new.minutes;
    if not new.is_active then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.is_active and new.price_pence = old.price_pence and new.minutes = old.minutes then
      return new;
    end if;
  end if;

  select s.linked_max_hourly_pence, s.name
    into v_cap, v_school
    from public.school_links l
    join public.businesses s on s.id = l.school_id
   where l.business_id = new.business_id
     and l.status = 'active';

  if v_cap is not null and new.price_pence::bigint * 60 > v_cap::bigint * v_minutes then
    raise exception 'VALIDATION_FAILED'
      using detail = jsonb_build_object('field', 'price', 'reason', 'above_school_cap', 'maxHourlyPence', v_cap, 'school', v_school)::text;
  end if;
  return new;
end;
$$;

create trigger lesson_prices_school_cap
  before insert or update on public.lesson_prices
  for each row execute function private.hold_to_school_price_cap();

create trigger packages_school_cap
  before insert or update on public.packages
  for each row execute function private.hold_to_school_price_cap();

-- ---------------------------------------------------------------------------------------
-- The school's guide, for the instructor whose Business is linked to it, and whether the school
-- vouches for their badge.
-- ---------------------------------------------------------------------------------------
create or replace function public.school_link_of(p_business_id uuid)
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

  return (
    select jsonb_build_object(
             'linkId', l.id,
             'schoolName', s.name,
             'schoolSlug', s.slug,
             'linkedAt', l.started_at,
             'proGiven', l.pro_given,
             -- Whether the school vouches for the badge, or the platform checked it before (D-280).
             'vouched', exists (
               select 1 from public.instructor_profiles p where p.business_id = p_business_id and p.vouched_at is not null
             ),
             'recommendedHourlyPence', s.linked_recommended_hourly_pence,
             'maxHourlyPence', s.linked_max_hourly_pence
           )
      from public.school_links l
      join public.businesses s on s.id = l.school_id
     where l.business_id = p_business_id and l.status = 'active'
  );
end;
$$;
