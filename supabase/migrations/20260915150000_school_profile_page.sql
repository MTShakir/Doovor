-- The public school profile (PUB-01, M5-03).
--
-- /schools/<city>/<slug> is read through this function alone, as an instructor's profile is: a
-- fixed list of fields, so a column added to businesses later is private until somebody adds it
-- here on purpose. Only a school in good standing has one. Its instructors are the ones a
-- learner could find anyway: approved, and not hidden from search (PUB-04), each with the
-- address of their own profile.

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
                          'takingBookings', i.badge_expiry is null or i.badge_expiry >= current_date,
                          -- The lowest price for an hour, rounded up to the penny, as the profile says it.
                          'hourlyFromPence', (
                            select min(ceil(lp.price_pence * 60.0 / lp.duration_minutes))::integer
                              from public.lesson_prices lp
                              join public.lesson_types t on t.id = lp.lesson_type_id
                             where lp.business_id = b.id
                               and t.is_active
                               and (lp.instructor_id = i.id or lp.instructor_id is null)
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

revoke all on function public.school_profile_page(text) from public;
grant execute on function public.school_profile_page(text) to anon, authenticated;
