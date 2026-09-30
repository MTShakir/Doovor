-- The Business's own colour reaches its public profile (D-229).
--
-- An instructor picks a colour (D-210) and until now it showed on the booking link only. The
-- profile page is the page a learner is sent to, so it carries the colour too: the edges of the
-- free times, the edge of the map, the edge of the prices card and the button on it.
--
-- Nothing about the colour's rules changes. `set_brand_colour` already refuses anything under
-- 4.5:1 against white, which is what makes it safe behind white text on the button and more than
-- enough for an edge, where 3:1 is the bar (WCAG 1.4.11).

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
           'inSearch', private.instructor_in_search(i.verification_status, i.badge_expiry, i.is_listed, b.status),
           -- A badge out of date takes no new bookings (INS-03); the profile still says who they are.
           'takingBookings', i.badge_expiry is null or i.badge_expiry >= private.today(),
           'instantBook', i.instant_book,
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