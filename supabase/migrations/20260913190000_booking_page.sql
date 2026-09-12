-- The public booking link (BOK-02, M2-17).
--
-- Everything on /book/<slug> is read through these two functions, because none of it is
-- readable by a stranger otherwise: an instructor's hours, prices and diary are their own.
-- What comes back is what the instructor publishes, plus the times they are free.

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
           'lessons', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'lessonTypeId', p.lesson_type_id,
                          'name', t.name,
                          'durationMinutes', p.duration_minutes,
                          'pricePence', p.price_pence
                        )
                        order by p.duration_minutes
                      )
                 from public.lesson_prices p
                 join public.lesson_types t on t.id = p.lesson_type_id
                where p.business_id = i.business_id
                  and t.is_active
                  and (p.instructor_id = i.id or p.instructor_id is null)
             ),
             '[]'::jsonb
           )
         )
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
   where i.public_slug = p_slug
     -- A link only takes bookings for somebody the platform has actually checked (INS-02),
     -- whose badge is still in date (INS-03).
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= current_date);
$$;

/**
 * The times a learner could take on one day (BOK-02, R-04). Every half hour is offered to
 * the same rules the booking itself is held to, so nothing on this page can be booked and
 * then refused.
 */
create or replace function public.open_slots(
  p_instructor_id uuid,
  p_date date,
  p_duration_minutes integer
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
              and (i.badge_expiry is null or i.badge_expiry >= current_date)
         )
     and private.slot_problem(p_instructor_id, candidate, p_duration_minutes, 'learner', null, now()) is null;
$$;

revoke all on function public.booking_page(text) from public;
revoke all on function public.open_slots(uuid, date, integer) from public;
grant execute on function public.booking_page(text) to anon, authenticated;
grant execute on function public.open_slots(uuid, date, integer) to anon, authenticated;
