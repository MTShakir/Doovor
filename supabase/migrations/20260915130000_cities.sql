-- Cities and their areas, for the public pages (PRD 8.3, M5-01).
--
-- Reference data, as skills and postcodes are: anybody may read it, and only migrations write it.
-- A city is a group of local authority districts, named exactly as the Office for National
-- Statistics names them. That is what postcodes.io returns for every postcode, and what the
-- postcode cache keeps as `admin_district`, so a cached postcode finds its city by name.
--
-- The launch cities are the three the plan names. The first launch region is the product owner's
-- decision (PRD 20); a city is added with a migration like this one (D-108).
--
-- packages/core/src/places.ts holds the same naming rules for the app, and a test on each side
-- pins them to the same names.

create table public.cities (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null unique check (char_length(name) between 1 and 80)
);

comment on table public.cities is
  'Reference data: the launch cities of the public pages (PRD 8.3, M5-01). Written by migrations only.';

create table public.city_districts (
  admin_district text primary key check (char_length(admin_district) between 1 and 80),
  city_slug text not null references public.cities (slug),
  -- The district's own page under its city, as /driving-lessons/london/croydon. Null for the
  -- district a city is named after, whose page is the city's own. Never a transmission, which
  -- has a page of its own at the same depth.
  area_slug text check (
    area_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(area_slug) <= 80
    and area_slug not in ('automatic', 'manual')
  ),
  area_name text check (char_length(area_name) between 1 and 80),
  check ((area_slug is null) = (area_name is null)),
  unique (city_slug, area_slug)
);

comment on table public.city_districts is
  'Reference data: which local authority districts make up each launch city, and the area page each has (M5-01).';

create index city_districts_city_idx on public.city_districts (city_slug);

alter table public.cities enable row level security;
alter table public.city_districts enable row level security;

grant select on public.cities, public.city_districts to anon, authenticated;
create policy cities_select_all on public.cities for select to anon, authenticated using (true);
create policy city_districts_select_all on public.city_districts for select to anon, authenticated using (true);

insert into public.cities (slug, name) values
  ('leeds', 'Leeds'),
  ('london', 'London'),
  ('manchester', 'Manchester');

insert into public.city_districts (admin_district, city_slug, area_slug, area_name) values
  ('Leeds', 'leeds', null, null),
  -- Greater Manchester's ten boroughs.
  ('Manchester', 'manchester', null, null),
  ('Bolton', 'manchester', 'bolton', 'Bolton'),
  ('Bury', 'manchester', 'bury', 'Bury'),
  ('Oldham', 'manchester', 'oldham', 'Oldham'),
  ('Rochdale', 'manchester', 'rochdale', 'Rochdale'),
  ('Salford', 'manchester', 'salford', 'Salford'),
  ('Stockport', 'manchester', 'stockport', 'Stockport'),
  ('Tameside', 'manchester', 'tameside', 'Tameside'),
  ('Trafford', 'manchester', 'trafford', 'Trafford'),
  ('Wigan', 'manchester', 'wigan', 'Wigan'),
  -- Greater London's 32 boroughs and the City of London.
  ('Barking and Dagenham', 'london', 'barking-and-dagenham', 'Barking and Dagenham'),
  ('Barnet', 'london', 'barnet', 'Barnet'),
  ('Bexley', 'london', 'bexley', 'Bexley'),
  ('Brent', 'london', 'brent', 'Brent'),
  ('Bromley', 'london', 'bromley', 'Bromley'),
  ('Camden', 'london', 'camden', 'Camden'),
  ('City of London', 'london', 'city-of-london', 'City of London'),
  ('Croydon', 'london', 'croydon', 'Croydon'),
  ('Ealing', 'london', 'ealing', 'Ealing'),
  ('Enfield', 'london', 'enfield', 'Enfield'),
  ('Greenwich', 'london', 'greenwich', 'Greenwich'),
  ('Hackney', 'london', 'hackney', 'Hackney'),
  ('Hammersmith and Fulham', 'london', 'hammersmith-and-fulham', 'Hammersmith and Fulham'),
  ('Haringey', 'london', 'haringey', 'Haringey'),
  ('Harrow', 'london', 'harrow', 'Harrow'),
  ('Havering', 'london', 'havering', 'Havering'),
  ('Hillingdon', 'london', 'hillingdon', 'Hillingdon'),
  ('Hounslow', 'london', 'hounslow', 'Hounslow'),
  ('Islington', 'london', 'islington', 'Islington'),
  ('Kensington and Chelsea', 'london', 'kensington-and-chelsea', 'Kensington and Chelsea'),
  ('Kingston upon Thames', 'london', 'kingston-upon-thames', 'Kingston upon Thames'),
  ('Lambeth', 'london', 'lambeth', 'Lambeth'),
  ('Lewisham', 'london', 'lewisham', 'Lewisham'),
  ('Merton', 'london', 'merton', 'Merton'),
  ('Newham', 'london', 'newham', 'Newham'),
  ('Redbridge', 'london', 'redbridge', 'Redbridge'),
  ('Richmond upon Thames', 'london', 'richmond-upon-thames', 'Richmond upon Thames'),
  ('Southwark', 'london', 'southwark', 'Southwark'),
  ('Sutton', 'london', 'sutton', 'Sutton'),
  ('Tower Hamlets', 'london', 'tower-hamlets', 'Tower Hamlets'),
  ('Waltham Forest', 'london', 'waltham-forest', 'Waltham Forest'),
  ('Wandsworth', 'london', 'wandsworth', 'Wandsworth'),
  ('Westminster', 'london', 'westminster', 'Westminster');

-- The name a district is known by: "Bristol, City of" is Bristol, "Glasgow City" is Glasgow.
create function private.place_name(p_district text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when btrim(p_district) ~ '^.+, (City|County) of$' then regexp_replace(btrim(p_district), ', (City|County) of$', '')
    when btrim(p_district) ~ '^City of .+$' then regexp_replace(btrim(p_district), '^City of ', '')
    when btrim(p_district) ~ '^.+ City$' then regexp_replace(btrim(p_district), ' City$', '')
    else btrim(p_district)
  end;
$$;

-- An address from a name: "Kingston upon Thames" is kingston-upon-thames.
create function private.place_slug(p_name text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        replace(
          lower(regexp_replace(normalize(p_name, NFKD), '[̀-ͯ]', '', 'g')),
          '&', ' and '
        ),
        '[''’]', '', 'g'
      ),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

grant execute on function private.place_name(text), private.place_slug(text) to anon, authenticated;

-- The place a postcode is in, from the cache: its city and area when a launch city takes its
-- district in, and otherwise the district as a place of its own, with no city page (has_hub
-- false). Nothing for a postcode the cache has not seen, or one with no district. The postcode
-- is given in its canonical form ("LS6 3QS", packages/core/src/postcode.ts).
create function public.place_of_postcode(p_postcode text)
returns table (city_slug text, city_name text, area_slug text, area_name text, has_hub boolean)
language sql
stable
set search_path = ''
as $$
  select coalesce(d.city_slug, private.place_slug(private.place_name(p.admin_district))),
         coalesce(c.name, private.place_name(p.admin_district)),
         d.area_slug,
         d.area_name,
         c.slug is not null
    from public.postcodes p
    left join public.city_districts d on d.admin_district = p.admin_district
    left join public.cities c on c.slug = d.city_slug
   where p.postcode = p_postcode
     and p.admin_district is not null;
$$;

grant execute on function public.place_of_postcode(text) to anon, authenticated;
