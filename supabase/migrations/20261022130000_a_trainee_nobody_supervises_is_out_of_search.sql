-- A trainee nobody supervises is out of search, as somebody whose badge has run out is
-- (INS-04, R-18, INS-03, D-347).
--
-- D-343 stopped anybody booking a trainee nobody supervises, and the profile said "Not taking new
-- bookings", but the city pages and the sitemap still listed them, so search sent learners to a
-- profile they could not book from. Being in search now asks whether they are supervised too.

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
           i.business_id, b.name as business_name, b.type as business_type, i.vouched_at,
           -- The name the list shows first, and is in the order of (D-269).
           case when b.type = 'independent' then b.name else i.display_name end as shown_name,
           d.area_slug, d.area_name, d.admin_district
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
      join public.postcodes pc on pc.postcode = i.base_postcode
      join public.city_districts d on d.admin_district = pc.admin_district
     where d.city_slug = p_city
       and i.public_slug is not null
       and (private.instructor_in_search(i.verification_status, i.badge_expiry, i.is_listed, b.status) and private.is_supervised(i.id))
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
                          -- The platform's tick is for a badge it checked itself (D-280, D-285).
                          'platformChecked', s.business_type = 'independent' and s.vouched_at is null,
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

create or replace function public.instructor_profile_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'instructorId', i.id,
           'slug', i.public_slug,
           'name', i.display_name,
           'photoPath', i.photo_path,
           'bio', i.bio,
           'languages', to_jsonb(i.languages),
           'yearsTeaching', i.years_teaching,
           'qualification', i.qualification,
           'transmission', i.transmission,
           'car', nullif(btrim(concat_ws(' ', i.car_make, i.car_model)), ''),
           'dualControls', i.dual_controls,
           'specialisms', to_jsonb(i.specialisms),
           'radiusMiles', i.radius_miles,
           'outcode', nullif(split_part(coalesce(i.base_postcode, ''), ' ', 1), ''),
           'areaCentre', case
             when i.base_location is null then null
             else jsonb_build_object(
               'latitude', round(extensions.st_y(i.base_location::extensions.geometry)::numeric, 2),
               'longitude', round(extensions.st_x(i.base_location::extensions.geometry)::numeric, 2)
             )
           end,
           'alsoCovers', coalesce(
             (
               select jsonb_agg(d.outcode order by d.outcode)
                 from public.coverage_districts d
                where d.instructor_id = i.id and d.rule = 'include'
             ),
             '[]'::jsonb
           ),
           'place', (
             select jsonb_build_object(
                      'citySlug', p.city_slug,
                      'cityName', p.city_name,
                      'areaSlug', p.area_slug,
                      'areaName', p.area_name,
                      'hasHub', p.has_hub
                    )
               from public.place_of_postcode(i.base_postcode) p
           ),
           'listed', i.is_listed,
           -- Whether search may show the profile at all: the instructor's choice, and a badge in date (M5-06).
           'inSearch', (private.instructor_in_search(i.verification_status, i.badge_expiry, i.is_listed, b.status) and private.is_supervised(i.id)),
           -- A badge out of date takes no new bookings (INS-03); the profile still says who they are.
           'takingBookings', (i.badge_expiry is null or i.badge_expiry >= private.today()) and private.is_supervised(i.id),
           'instantBook', i.instant_book,
           -- The platform's tick is for a badge it checked itself: a school vouches for its own
           -- instructors and for those linked to it (D-280, D-285).
           'platformChecked', b.type = 'independent' and i.vouched_at is null,
           -- The school an instructor's own Business is linked to, for the link to its page (D-285).
           'linkedSchool', (
             select jsonb_build_object(
                      'name', s.name,
                      'slug', s.slug,
                      'citySlug', (select sp.city_slug from public.place_of_postcode(s.base_postcode) sp)
                    )
               from public.school_links l
               join public.businesses s on s.id = l.school_id
              where l.business_id = b.id
                and l.status = 'active'
                and s.status = 'active'
           ),
           'business', jsonb_build_object(
             'name', b.name,
             'type', b.type,
             'slug', b.slug,
             -- The Business's own colour, which the page draws its edges and its one button with
             -- (D-210, D-229). Null unless they chose one, and the picker has already refused
             -- anything that cannot be read against white.
             'colour', b.brand_colour,
             -- Where the school's own profile lives, for the link to it (M5-03).
             'citySlug', (select bp.city_slug from public.place_of_postcode(b.base_postcode) bp)
           ),
           'lessons', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'lessonTypeId', lp.lesson_type_id,
                          'name', lp.name,
                          'durationMinutes', lp.duration_minutes,
                          'pricePence', lp.price_pence
                        )
                        order by lp.duration_minutes, lp.name
                      )
                 -- One price for each lesson: the instructor's own where they have one (SCH-04, D-122).
                 from private.effective_lesson_prices(i.id) lp
             ),
             '[]'::jsonb
           ),
           'packages', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'name', k.name,
                          'minutes', k.minutes,
                          'pricePence', k.price_pence,
                          'expiryDays', k.expiry_days
                        )
                        order by k.minutes, k.name
                      )
                 from public.packages k
                where k.business_id = i.business_id and k.is_active
             ),
             '[]'::jsonb
           )
         )
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
   where i.public_slug = p_slug
     -- A profile is made when the platform has checked the instructor (INS-05), and only while
     -- their Business is in good standing.
     and i.verification_status = 'approved'
     and b.status = 'active';
$$;

create or replace function public.sitemap_entries()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with searchable as (
    select i.public_slug, i.transmission, i.business_id, i.base_postcode, pc.admin_district
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
      left join public.postcodes pc on pc.postcode = i.base_postcode
     where i.public_slug is not null
       and (private.instructor_in_search(i.verification_status, i.badge_expiry, i.is_listed, b.status) and private.is_supervised(i.id))
  ),
  placed as (
    select s.transmission, d.city_slug, d.area_slug
      from searchable s
      join public.city_districts d on d.admin_district = s.admin_district
  ),
  places as (
    select p.city_slug, null::text as area_slug, false as automatic, count(*)::integer as n
      from placed p
     group by p.city_slug
    union all
    select p.city_slug, p.area_slug, false, count(*)::integer
      from placed p
     where p.area_slug is not null
     group by p.city_slug, p.area_slug
    union all
    select p.city_slug, null, true, count(*)::integer
      from placed p
     where p.transmission in ('automatic', 'both')
     group by p.city_slug
  )
  select jsonb_build_object(
           'instructors', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'slug', s.public_slug,
                          'citySlug', (select pp.city_slug from public.place_of_postcode(s.base_postcode) pp)
                        )
                        order by s.public_slug
                      )
                 from searchable s
             ),
             '[]'::jsonb
           ),
           'schools', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'slug', b.slug,
                          'citySlug', (select pp.city_slug from public.place_of_postcode(b.base_postcode) pp)
                        )
                        order by b.slug
                      )
                 from public.businesses b
                where b.type = 'school'
                  and b.status = 'active'
                  and exists (select 1 from searchable s where s.business_id = b.id)
             ),
             '[]'::jsonb
           ),
           'places', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'citySlug', x.city_slug,
                          'areaSlug', x.area_slug,
                          'automatic', x.automatic,
                          'instructorCount', x.n
                        )
                        order by x.city_slug, x.automatic, x.area_slug nulls first
                      )
                 from places x
             ),
             '[]'::jsonb
           )
         );
$$;
