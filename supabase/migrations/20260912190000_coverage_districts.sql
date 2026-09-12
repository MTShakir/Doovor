-- Coverage beyond the circle: districts added and districts left out (COV-02, M1-15).
--
-- The radius answers most of the question. The exceptions are the rest of it: a district the
-- circle misses that an instructor happily drives to, and one inside the circle they will not
-- take, usually because of the traffic. Both are stored as outward codes ("LS17"), which is
-- what a person says and what postcodes.io returns.

create type public.coverage_rule as enum ('include', 'exclude');

create table public.coverage_districts (
  instructor_id uuid not null,
  business_id uuid not null,
  outcode text not null check (outcode ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?$'),
  rule public.coverage_rule not null,
  created_at timestamptz not null default now(),
  primary key (instructor_id, outcode),
  foreign key (instructor_id, business_id) references public.instructor_profiles (id, business_id) on delete cascade
);

create index coverage_districts_business_idx on public.coverage_districts (business_id);

alter table public.coverage_districts enable row level security;

-- The public site needs to read these to answer "do you cover me?" before anyone signs in.
grant select on public.coverage_districts to anon, authenticated;
grant insert (instructor_id, business_id, outcode, rule), delete on public.coverage_districts to authenticated;

create policy coverage_districts_select_all on public.coverage_districts
  for select to anon, authenticated
  using (true);

create policy coverage_districts_write on public.coverage_districts
  for all to authenticated
  using (
    instructor_id in (select private.auth_instructor_ids())
    or private.auth_has_permission(business_id, 'manage_availability')
  )
  with check (
    instructor_id in (select private.auth_instructor_ids())
    or private.auth_has_permission(business_id, 'manage_availability')
  );

-- ---------------------------------------------------------------------------------------
-- covers_postcode: the whole rule in one place (COV-01, COV-02).
--
-- An excluded district wins over everything, then an included one, then the circle. A
-- postcode nobody has looked up yet is not covered: the answer has to come from a place.
-- ---------------------------------------------------------------------------------------
create or replace function public.covers_postcode(p_instructor_id uuid, p_postcode text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with place as (
    select outcode, location from public.postcodes where postcode = upper(btrim(p_postcode))
  ),
  instructor as (
    select base_location, radius_miles from public.instructor_profiles where id = p_instructor_id
  )
  select case
    when (select count(*) from place) = 0 then false
    when exists (
      select 1 from public.coverage_districts d, place
       where d.instructor_id = p_instructor_id and d.outcode = place.outcode and d.rule = 'exclude'
    ) then false
    when exists (
      select 1 from public.coverage_districts d, place
       where d.instructor_id = p_instructor_id and d.outcode = place.outcode and d.rule = 'include'
    ) then true
    else coalesce(
      (select extensions.st_dwithin(i.base_location, p.location, i.radius_miles * 1609.344)
         from instructor i, place p
        where i.base_location is not null),
      false
    )
  end;
$$;

revoke all on function public.covers_postcode(uuid, text) from public;
grant execute on function public.covers_postcode(uuid, text) to anon, authenticated;
