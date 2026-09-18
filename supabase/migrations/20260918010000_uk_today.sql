-- The day a badge runs out, and the day somebody turns 17, are days in the United Kingdom
-- (M6-06, D-141).
--
-- `current_date` is the database's day, and the database keeps UTC. Between midnight in London and
-- midnight in UTC, which is the hour before one in the morning through British Summer Time, they
-- are different days: a badge that ran out yesterday still counted as in date, an instructor stayed
-- bookable for an hour after they should not have been, and a learner was a day younger than they
-- are. The app has always worked in Europe/London, so the database does too now, through
-- `private.today()`.
--
-- Every function that compares a stored date with today is re-created below. Nothing else changes.

create or replace function private.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/London')::date;
$$;

comment on function private.today() is 'Today in the United Kingdom, which is the day the product runs on (D-141).';

revoke all on function private.today() from public;
grant execute on function private.today() to anon, authenticated, service_role;

create or replace function private.learner_age_band(p_learner_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.auth_can_see_learner(p_learner_id) then null
    when lp.date_of_birth is null then null
    when lp.date_of_birth > (private.today() - interval '18 years')::date then 'under_18'
    else '18_plus'
  end
    from public.learner_private lp
   where lp.user_id = p_learner_id;
$$;

create or replace function public.submit_verification(
  p_profile_id uuid,
  p_qualification public.instructor_qualification,
  p_badge_number text,
  p_badge_expiry date,
  p_dbs_confirmed boolean,
  p_badge_path text default null
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := upper(trim(coalesce(p_badge_number, '')));
  v_business uuid;
  v_before jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_profile_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_number !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeNumber"}';
  end if;
  if p_badge_expiry is null or p_badge_expiry <= private.today() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeExpiry"}';
  end if;
  -- Teaching a learner requires a current enhanced check.
  if p_dbs_confirmed is not true then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dbsConfirmed"}';
  end if;
  if p_badge_path is not null and p_badge_path !~ ('^' || p_profile_id::text || '/[a-z0-9-]{8,64}\.webp$') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgePath"}';
  end if;

  select business_id,
         jsonb_build_object(
           'qualification', qualification,
           'badge_number', badge_number,
           'verification_status', verification_status
         )
    into v_business, v_before
    from public.instructor_profiles
   where id = p_profile_id;

  update public.instructor_profiles
     set qualification = p_qualification,
         badge_number = v_number,
         badge_expiry = p_badge_expiry,
         badge_path = coalesce(p_badge_path, badge_path),
         dbs_confirmed_at = now(),
         verification_status = 'pending',
         verification_submitted_at = now(),
         verification_decision_reason = null,
         verified_at = null
   where id = p_profile_id;

  perform private.write_audit(
    'instructor.verification_submitted', 'instructor_profile', p_profile_id, v_business, v_before,
    jsonb_build_object('qualification', p_qualification, 'badge_number', v_number, 'verification_status', 'pending')
  );

  -- Staff are told there is something to review, outside this transaction (D-017).
  perform private.enqueue_event(
    'instructor/verification-submitted',
    jsonb_build_object('instructor_profile_id', p_profile_id, 'business_id', v_business)
  );

  return 'pending'::public.verification_status;
end;
$$;

create or replace function public.system_claim_badge_reminders(p_today date default private.today())
returns table (instructor_id uuid, business_id uuid, badge_expiry date, days_before smallint, days_left integer)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select p.id,
           p.business_id,
           p.badge_expiry,
           (p.badge_expiry - p_today)::integer as days_left,
           -- Nearest milestone first, so five days left is the seven-day warning.
           (case
              when p.badge_expiry - p_today <= 7 then 7
              when p.badge_expiry - p_today <= 30 then 30
              else 60
            end)::smallint as milestone
      from public.instructor_profiles p
     where p.badge_expiry is not null
       and p.badge_expiry >= p_today
       and p.badge_expiry - p_today <= 60
  ),
  claimed as (
    insert into public.badge_reminders (instructor_id, badge_expiry, days_before)
    select id, badge_expiry, milestone from due
    on conflict (instructor_id, badge_expiry, days_before) do nothing
    returning instructor_id, badge_expiry, days_before
  )
  select c.instructor_id, d.business_id, c.badge_expiry, c.days_before, d.days_left
    from claimed c
    join due d on d.id = c.instructor_id;
$$;

create or replace function public.system_unlist_expired_badges(p_today date default private.today())
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

create or replace function private.learner_private_min_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.date_of_birth is not null
     and new.date_of_birth > (private.today() - interval '16 years')::date then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dateOfBirth"}';
  end if;
  return new;
end;
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
     -- A link only takes bookings for somebody the platform has actually checked (INS-02),
     -- whose badge is still in date (INS-03), at a Business that is not suspended (ADM-02).
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= private.today())
     and b.status <> 'suspended';
$$;

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
              and (i.badge_expiry is null or i.badge_expiry >= private.today())
         )
     and private.slot_problem(p_instructor_id, candidate, p_duration_minutes, 'learner', null, now(),
                              p_except_booking_id) is null;
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
           'takingBookings', i.badge_expiry is null or i.badge_expiry >= private.today(),
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
       and (i.badge_expiry is null or i.badge_expiry >= private.today())
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
                          'takingBookings', i.badge_expiry is null or i.badge_expiry >= private.today(),
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

create or replace function private.instructor_in_search(
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
     and (p_badge_expiry is null or p_badge_expiry >= private.today())
     and p_listed
     and p_business_status = 'active';
$$;

