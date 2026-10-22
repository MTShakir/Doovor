-- A trainee nobody supervises takes no bookings, and the public pages say so before anybody tries
-- (INS-04, R-18, D-343).
--
-- A booking for a trainee with nobody supervising them is refused where it is written (D-061),
-- but the profile said they were taking bookings and the booking link offered their free times,
-- so a learner chose a time, made an account and was turned away at the end. Every place that
-- asks whether an instructor's badge lets them be booked now asks whether they are supervised too,
-- as an expired badge is handled: not taking new bookings, and no times to choose.

create or replace function public.open_slots(
  p_instructor_id uuid,
  p_date date,
  p_duration_minutes integer,
  p_except_booking_id uuid default null
)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select candidate
    from generate_series(
           (p_date + time '00:00') at time zone 'Europe/London',
           (p_date + time '23:30') at time zone 'Europe/London',
           interval '30 minutes'
         ) as candidate
   where exists (
           select 1 from public.instructor_profiles i
            where i.id = p_instructor_id
              and i.verification_status = 'approved'
              and (i.badge_expiry is null or i.badge_expiry >= private.today()) and private.is_supervised(i.id)
         )
     and private.slot_problem(p_instructor_id, candidate, p_duration_minutes, 'learner', null, now(),
                              p_except_booking_id) is null;
$$;

create or replace function public.next_open_slots(
  p_instructor_id uuid,
  p_duration_minutes integer,
  p_limit integer default 3
)
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 3), 1), 10);
  v_now timestamptz := now();
  v_local timestamp := v_now at time zone 'Europe/London';
  v_first timestamptz;
  v_candidate timestamptz;
  v_found integer := 0;
begin
  if not exists (
    select 1
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
     where i.id = p_instructor_id
       and i.verification_status = 'approved'
       and (i.badge_expiry is null or i.badge_expiry >= private.today()) and private.is_supervised(i.id)
       and b.status = 'active'
  ) then
    return;
  end if;

  -- The next half hour on the clock in London. Offsets there are whole hours, so every step of
  -- thirty minutes from it lands on a half hour too, across a clock change.
  v_first := (date_trunc('hour', v_local) + interval '30 minutes' * (floor(extract(minute from v_local) / 30) + 1))
               at time zone 'Europe/London';

  for v_candidate in
    select candidate
      from generate_series(v_first, v_first + interval '14 days', interval '30 minutes') as candidate
  loop
    if private.slot_problem(p_instructor_id, v_candidate, p_duration_minutes, 'learner', null, v_now) is null then
      return next v_candidate;
      v_found := v_found + 1;
      exit when v_found >= v_limit;
    end if;
  end loop;
end;
$$;

create or replace function public.cancellation_policy(p_instructor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'windowHours', (r.rules ->> 'cancellation_window_hours')::int,
           'lateFeePercent', (r.rules ->> 'late_fee_percent')::int
         )
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
    cross join lateral (select private.booking_rules(i.id) as rules) r
   where i.id = p_instructor_id
     and i.public_slug is not null
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= private.today()) and private.is_supervised(i.id)
     and b.status <> 'suspended';
$$;

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
           'inSearch', private.instructor_in_search(i.verification_status, i.badge_expiry, i.is_listed, b.status),
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

create or replace function public.school_profile_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'slug', b.slug,
           'name', b.name,
           'logoPath', b.logo_url,
           'outcode', nullif(split_part(coalesce(b.base_postcode, ''), ' ', 1), ''),
           'place', (
             select jsonb_build_object(
                      'citySlug', p.city_slug,
                      'cityName', p.city_name,
                      'areaSlug', p.area_slug,
                      'areaName', p.area_name,
                      'hasHub', p.has_hub
                    )
               from public.place_of_postcode(b.base_postcode) p
           ),
           'instructors', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'instructorId', i.id,
                          'slug', i.public_slug,
                          'name', i.display_name,
                          'photoPath', i.photo_path,
                          'qualification', i.qualification,
                          'transmission', i.transmission,
                          'car', nullif(btrim(concat_ws(' ', i.car_make, i.car_model)), ''),
                          'citySlug', (select ip.city_slug from public.place_of_postcode(i.base_postcode) ip),
                          'takingBookings', (i.badge_expiry is null or i.badge_expiry >= private.today()) and private.is_supervised(i.id),
                          -- The lowest price for an hour, rounded up to the penny, as the profile says it.
                          'hourlyFromPence', (
                            select min(ceil(lp.price_pence * 60.0 / lp.duration_minutes))::integer
                              from private.effective_lesson_prices(i.id) lp
                          )
                        )
                        order by i.display_name, i.public_slug
                      )
                 from public.instructor_profiles i
                where i.business_id = b.id
                  and i.verification_status = 'approved'
                  and i.is_listed
                  and i.public_slug is not null
             ),
             '[]'::jsonb
           ),
           -- Instructors who run their own Business and are linked to the school (D-282, D-285),
           -- by the name their profile goes by, and with the platform's tick where it checked them.
           'linked', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'instructorId', i.id,
                          'slug', i.public_slug,
                          'name', i.display_name,
                          'business', jsonb_build_object('name', ob.name, 'type', ob.type),
                          'photoPath', i.photo_path,
                          'qualification', i.qualification,
                          'transmission', i.transmission,
                          'car', nullif(btrim(concat_ws(' ', i.car_make, i.car_model)), ''),
                          'citySlug', (select ip.city_slug from public.place_of_postcode(i.base_postcode) ip),
                          'takingBookings', (i.badge_expiry is null or i.badge_expiry >= private.today()) and private.is_supervised(i.id),
                          'hourlyFromPence', (
                            select min(ceil(lp.price_pence * 60.0 / lp.duration_minutes))::integer
                              from private.effective_lesson_prices(i.id) lp
                          ),
                          'platformChecked', i.vouched_at is null
                        )
                        order by lower(ob.name), i.public_slug
                      )
                 from public.school_links l
                 join public.businesses ob on ob.id = l.business_id and ob.status = 'active'
                 join public.memberships m on m.business_id = ob.id and m.role = 'owner' and m.status = 'active'
                 join public.instructor_profiles i on i.business_id = ob.id and i.user_id = m.user_id
                where l.school_id = b.id
                  and l.status = 'active'
                  and i.verification_status = 'approved'
                  and i.is_listed
                  and i.public_slug is not null
             ),
             '[]'::jsonb
           ),
           'lessons', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'name', t.name,
                          'durationMinutes', lp.duration_minutes,
                          'pricePence', lp.price_pence
                        )
                        order by lp.duration_minutes, t.name
                      )
                 from public.lesson_prices lp
                 join public.lesson_types t on t.id = lp.lesson_type_id
                where lp.business_id = b.id
                  and t.is_active
                  -- The school's own prices; an instructor's own price is on their profile.
                  and lp.instructor_id is null
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
                where k.business_id = b.id and k.is_active
             ),
             '[]'::jsonb
           )
         )
    from public.businesses b
   where b.slug = p_slug
     and b.type = 'school'
     and b.status = 'active';
$$;
