-- Writing to the postcode cache (COV-03, M1-05).
--
-- The table came with the schema (M0-20) as public reference data with no write grant.
-- This adds the one way in: coordinates come from postcodes.io, which is Ordnance Survey
-- open data, and the app records what it was told. Postcodes do not move, so a row is only
-- ever added and never changed: one signed-in person cannot move a postcode that another
-- instructor already covers. Refreshing a stale row is a job, with the secret key.

-- Radius searches read this table by distance (COV-01, M1-07).
create index postcodes_location_idx on public.postcodes using gist (location);

create or replace function public.cache_postcode(
  p_postcode text,
  p_outcode text,
  p_latitude double precision,
  p_longitude double precision,
  p_district text default null,
  p_country text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_area text := substring(upper(coalesce(p_outcode, '')) from '^[A-Z]{1,2}');
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_postcode !~ '^[A-Z]{1,2}[0-9][A-Z0-9]? [0-9][A-Z]{2}$' or v_area is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "postcode"}';
  end if;
  -- Great Britain and Northern Ireland, with room to spare (packages/core/src/postcode.ts).
  if p_latitude is null or p_longitude is null
     or p_latitude not between 49.5 and 61.0
     or p_longitude not between -8.8 and 2.1 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "coordinates"}';
  end if;

  insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district, country)
  values (
    p_postcode, upper(p_outcode), v_area, p_latitude, p_longitude,
    nullif(left(p_district, 80), ''), nullif(left(p_country, 40), '')
  )
  on conflict (postcode) do nothing;
end;
$$;

revoke all on function public.cache_postcode(text, text, double precision, double precision, text, text)
  from public, anon;
grant execute on function public.cache_postcode(text, text, double precision, double precision, text, text)
  to authenticated;
