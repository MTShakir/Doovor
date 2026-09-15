-- The public instructor profile (PUB-01, INS-05, M5-02).
--
-- Everything on /instructors/<city>/<slug> is read through these two functions: none of it is
-- readable by a stranger otherwise. What comes back is written out field by field, so a column
-- added to instructor_profiles later is private until somebody adds it here on purpose. Never
-- the badge number, the date of birth, the home postcode or where exactly the instructor lives:
-- the area covered is drawn from a point rounded to about a kilometre, and named by its district.

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
           -- A badge out of date takes no new bookings (INS-03); the profile still says who they are.
           'takingBookings', i.badge_expiry is null or i.badge_expiry >= current_date,
           'instantBook', i.instant_book,
           'business', jsonb_build_object('name', b.name, 'type', b.type, 'slug', b.slug),
           'lessons', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'lessonTypeId', lp.lesson_type_id,
                          'name', t.name,
                          'durationMinutes', lp.duration_minutes,
                          'pricePence', lp.price_pence
                        )
                        order by lp.duration_minutes, t.name
                      )
                 from public.lesson_prices lp
                 join public.lesson_types t on t.id = lp.lesson_type_id
                where lp.business_id = i.business_id
                  and t.is_active
                  and (lp.instructor_id = i.id or lp.instructor_id is null)
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

/**
 * The next times a learner could book, across the next 14 days (PUB-01, R-04): every half hour
 * in London from the next one, held to the same rules as the booking itself, stopping at the
 * limit (3 unless asked, never more than 10). Nothing for an instructor who takes no bookings.
 */
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
       and (i.badge_expiry is null or i.badge_expiry >= current_date)
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

revoke all on function public.instructor_profile_page(text) from public;
revoke all on function public.next_open_slots(uuid, integer, integer) from public;
grant execute on function public.instructor_profile_page(text) to anon, authenticated;
grant execute on function public.next_open_slots(uuid, integer, integer) to anon, authenticated;
