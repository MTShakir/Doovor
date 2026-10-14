-- The city, area and automatic pages list an independent instructor by their Business name, as
-- their profile does (PUB-01, D-269).
--
-- city_page returns each instructor's Business name and kind, and the app applies the one rule
-- for which name goes first (`profileNames` in packages/core). The list is in the order of the
-- names it shows. Everything else is as it was.

create or replace function public.city_page(p_city text, p_area text default null, p_transmission text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with city as (
    select c.slug, c.name from public.cities c where c.slug = p_city
  ),
  area as (
    select d.area_slug as slug, d.area_name as name, d.admin_district
      from public.city_districts d
     where d.city_slug = p_city and p_area is not null and d.area_slug = p_area
  ),
  searchable as (
    select i.id, i.public_slug, i.display_name, i.photo_path, i.qualification, i.transmission,
           nullif(btrim(concat_ws(' ', i.car_make, i.car_model)), '') as car,
           i.business_id, b.name as business_name, b.type as business_type,
           -- The name the list shows first, and is in the order of (D-269).
           case when b.type = 'independent' then b.name else i.display_name end as shown_name,
           d.area_slug, d.area_name, d.admin_district
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
      join public.postcodes pc on pc.postcode = i.base_postcode
      join public.city_districts d on d.admin_district = pc.admin_district
     where d.city_slug = p_city
       and i.public_slug is not null
       and private.instructor_in_search(i.verification_status, i.badge_expiry, i.is_listed, b.status)
  ),
  shown as (
    select s.*
      from searchable s
     where (p_area is null or s.admin_district = (select a.admin_district from area a))
       and (p_transmission is null or s.transmission::text in (p_transmission, 'both'))
  )
  select jsonb_build_object(
           'city', jsonb_build_object('slug', city.slug, 'name', city.name),
           'area', (select jsonb_build_object('slug', a.slug, 'name', a.name) from area a),
           'transmission', p_transmission,
           -- The city's areas with an instructor in search, for the links between the pages.
           'areas', coalesce(
             (
               select jsonb_agg(jsonb_build_object('slug', x.area_slug, 'name', x.area_name, 'instructorCount', x.n)
                                order by x.area_name)
                 from (
                   select s.area_slug, s.area_name, count(*)::integer as n
                     from searchable s
                    where s.area_slug is not null
                    group by s.area_slug, s.area_name
                 ) x
             ),
             '[]'::jsonb
           ),
           'automaticCount', (select count(*)::integer from searchable s where s.transmission in ('automatic', 'both')),
           'instructors', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'slug', s.public_slug,
                          'name', s.display_name,
                          'business', jsonb_build_object('name', s.business_name, 'type', s.business_type),
                          'photoPath', s.photo_path,
                          'qualification', s.qualification,
                          'transmission', s.transmission,
                          'car', s.car,
                          'areaName', s.area_name,
                          'hourlyFromPence', (
                            select min(ceil(lp.price_pence * 60.0 / lp.duration_minutes))::integer
                              from private.effective_lesson_prices(s.id) lp
                          )
                        )
                        order by lower(s.shown_name), s.public_slug
                      )
                 from shown s
             ),
             '[]'::jsonb
           )
         )
    from city
   -- An area the city does not have is no page at all.
   where p_area is null or exists (select 1 from area);
$$;
