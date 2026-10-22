-- A full list on Free is said before anybody makes an account to book (BOK-02, PUB-03, D-208, D-357).
--
-- An instructor on Free with ten learners on the books takes nobody new, but their booking link
-- and profile offered times to anybody, so a visitor chose one, made an account, confirmed their
-- email, filled in the form about themselves and only then was refused, in words written for the
-- instructor about their plan. The link now says whether somebody new can start, knowing the
-- person looking (anybody already with the Business books as ever), and the profile says whether
-- the list is full.

create or replace function public.booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'instructorId', i.id,
           'name', i.display_name,
           'photoPath', i.photo_path,
           'transmission', i.transmission,
           'car', nullif(btrim(concat_ws(' ', i.car_make, i.car_model)), ''),
           'businessName', b.name,
           'instantBook', i.instant_book,
           'brandColour', case when b.plan <> 'free' then b.brand_colour end,
           'logoUrl', case when b.plan <> 'free' then b.logo_url end,
           'platformChecked', b.type = 'independent' and i.vouched_at is null,
           -- A full list on Free takes nobody new, though anybody already learning with them books as
           -- ever: their place on the books is already there, so nothing is added (D-208, D-357).
           'takingNewLearners', private.learner_room(b.id) or exists (
             select 1 from public.learner_relationships r
              where r.business_id = b.id and r.learner_id = (select auth.uid())
           ),
           'lessons', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'lessonTypeId', p.lesson_type_id,
                          'name', p.name,
                          'durationMinutes', p.duration_minutes,
                          'pricePence', p.price_pence
                        )
                        order by p.duration_minutes, p.name
                      )
                 -- One price for each lesson: the instructor's own where they have one (SCH-04, D-122).
                 from private.effective_lesson_prices(i.id) p
             ),
             '[]'::jsonb
           )
         )
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
   where i.public_slug = p_slug
     -- A link only takes bookings for somebody the platform has checked, or their school has vouched
     -- for (INS-02, D-280), whose badge is still in date (INS-03), at a Business not suspended (ADM-02)
     -- and not paused while its owner teaches under a school (D-292, D-311).
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= private.today()) and private.is_supervised(i.id)
     and b.status not in ('suspended', 'paused');
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
           -- Whether somebody new can start: not while a Free list is full (D-208, D-357).
           'takingNewLearners', private.learner_room(b.id),
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
