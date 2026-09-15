-- In search, hidden from search, and out of date (PUB-04, INS-03, M5-06).
--
-- `is_listed` is now only the instructor's own choice: Show me in search, on their Profile screen
-- (PUB-04). Whether search shows a profile is worked out in one place, `private.instructor_in_search`:
-- approved, a badge in date, listed, and a Business in good standing. An expired badge no longer
-- switches `is_listed` off, so renewing it brings the profile back without anybody turning it on
-- again, and a profile somebody hid on purpose stays hidden through a renewal (D-113). The booking
-- link keeps working while a profile is hidden from search; it pauses only while the badge is out
-- of date, as `booking_page` already has it.

create function private.instructor_in_search(
  p_verification public.verification_status,
  p_badge_expiry date,
  p_listed boolean,
  p_business_status public.business_status
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_verification = 'approved'
     and (p_badge_expiry is null or p_badge_expiry >= current_date)
     and p_listed
     and p_business_status = 'active';
$$;

-- An expired badge is recorded as the last milestone of its set, 0 days before, so the job that
-- notices it does so once per badge, as reminders already are.
alter table public.badge_reminders drop constraint badge_reminders_days_before_check;
alter table public.badge_reminders
  add constraint badge_reminders_days_before_check check (days_before in (60, 30, 7, 0));

-- Badges that ran out before today were dealt with by the job as it was: nobody is told again.
insert into public.badge_reminders (instructor_id, badge_expiry, days_before)
select p.id, p.badge_expiry, 0
  from public.instructor_profiles p
 where p.badge_expiry is not null
   and p.badge_expiry < current_date
on conflict (instructor_id, badge_expiry, days_before) do nothing;

-- Profiles the job took out of search come back under the new rule, which keeps an expired badge
-- out by itself. Nobody could hide a profile by hand before this, so none of these was a choice.
update public.instructor_profiles p
   set is_listed = true
 where not p.is_listed
   and exists (
     select 1
       from public.audit_log a
      where a.action = 'instructor.unlisted_badge_expired'
        and a.entity_id = p.id
   );

-- ---------------------------------------------------------------------------------------
-- The daily job: each badge that has run out, once. It no longer changes is_listed; search
-- leaves the profile out because the badge is out of date. The audit line and the event stay,
-- for the instructor to be told (INS-03).
-- ---------------------------------------------------------------------------------------
create or replace function public.system_unlist_expired_badges(p_today date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_business_id uuid;
  v_count integer := 0;
begin
  for v_row in
    insert into public.badge_reminders (instructor_id, badge_expiry, days_before)
    select p.id, p.badge_expiry, 0
      from public.instructor_profiles p
     where p.badge_expiry is not null
       and p.badge_expiry < p_today
    on conflict (instructor_id, badge_expiry, days_before) do nothing
    returning instructor_id, badge_expiry
  loop
    select p.business_id into v_business_id from public.instructor_profiles p where p.id = v_row.instructor_id;
    v_count := v_count + 1;
    perform private.write_audit(
      'instructor.unlisted_badge_expired', 'instructor_profile', v_row.instructor_id, v_business_id, null,
      jsonb_build_object('badge_expiry', v_row.badge_expiry)
    );
    perform private.enqueue_event(
      'instructor/badge-expired',
      jsonb_build_object('instructor_profile_id', v_row.instructor_id, 'business_id', v_business_id)
    );
  end loop;
  return v_count;
end;
$$;

-- The public profile says whether search may show it (M5-02, as it was, with inSearch added).
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
           'takingBookings', i.badge_expiry is null or i.badge_expiry >= current_date,
           'instantBook', i.instant_book,
           'business', jsonb_build_object(
             'name', b.name,
             'type', b.type,
             'slug', b.slug,
             -- Where the school's own profile lives, for the link to it (M5-03).
             'citySlug', (select bp.city_slug from public.place_of_postcode(b.base_postcode) bp)
           ),
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

revoke all on function public.instructor_profile_page(text) from public;
grant execute on function public.instructor_profile_page(text) to anon, authenticated;
