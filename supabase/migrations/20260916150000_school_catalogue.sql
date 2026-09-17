-- School prices, packages and rules, with instructor prices over them (SCH-04, R-05, R-06, M5-15).
--
-- A school sets the prices, packages, cancellation policy and booking rules that apply to all its
-- instructors. An instructor the school lets set their own prices (set_own_prices, D-120) may put
-- their own price on any lesson, and that price wins over the school's wherever a price is shown
-- or charged; taking the permission away returns them to the school's prices. Packages and the
-- cancellation policy stay the school's: credit is held with the Business (PAY-12), and the fee
-- for a late cancellation is the Business's money (D-122). Each instructor already keeps their
-- own gap between lessons and whether bookings are confirmed at once (M1-18).

-- ---------------------------------------------------------------------------------------
-- The price of each lesson for one instructor: their own where they have one, the Business's
-- otherwise, for lesson types still offered. Booking already charges this way (M2-16); every
-- page that shows prices now does too.
-- ---------------------------------------------------------------------------------------
create or replace function private.effective_lesson_prices(p_instructor_id uuid)
returns table (lesson_type_id uuid, name text, duration_minutes integer, price_pence integer)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (lp.lesson_type_id, lp.duration_minutes)
         lp.lesson_type_id, t.name, lp.duration_minutes::integer, lp.price_pence
    from public.instructor_profiles i
    join public.lesson_prices lp on lp.business_id = i.business_id and (lp.instructor_id = i.id or lp.instructor_id is null)
    join public.lesson_types t on t.id = lp.lesson_type_id and t.is_active
   where i.id = p_instructor_id
   order by lp.lesson_type_id, lp.duration_minutes, lp.instructor_id nulls last;
$$;

revoke all on function private.effective_lesson_prices(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- An instructor allowed to set their own prices writes their own rows and nobody else's. The
-- people who set the school's prices may already write any of them (M0-20).
-- ---------------------------------------------------------------------------------------
create policy lesson_prices_write_own on public.lesson_prices
  for all to authenticated
  using (instructor_id in (select private.auth_instructor_ids()) and private.auth_has_permission(business_id, 'set_own_prices'))
  with check (instructor_id in (select private.auth_instructor_ids()) and private.auth_has_permission(business_id, 'set_own_prices'));

-- ---------------------------------------------------------------------------------------
-- Pages that show prices, as before (M2-17, M5-02, M5-03, M5-07), with one price per lesson.
-- ---------------------------------------------------------------------------------------
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
     -- whose badge is still in date (INS-03).
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= current_date);
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
                          'takingBookings', i.badge_expiry is null or i.badge_expiry >= current_date,
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
           i.business_id, d.area_slug, d.area_name, d.admin_district
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
                        order by s.display_name, s.public_slug
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

-- ---------------------------------------------------------------------------------------
-- set_member_permission: as before (M5-13). Taking away an instructor's own prices removes
-- them, so they teach at the school's prices again at once, wherever a price is read.
-- ---------------------------------------------------------------------------------------
create or replace function public.set_member_permission(p_membership_id uuid, p_permission text, p_allowed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_member public.memberships;
  v_removed integer;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_allowed is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "allowed"}';
  end if;

  select m.* into v_member
    from public.memberships m
    join public.businesses b on b.id = m.business_id and b.type = 'school'
   where m.id = p_membership_id
     for update of m;
  if v_member.id is null or not private.auth_has_permission(v_member.business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_member.user_id = v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not ((p_permission = 'set_own_prices' and v_member.role = 'instructor')
          or (p_permission = 'view_revenue' and v_member.role = 'manager')) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "permission"}';
  end if;
  if p_permission = 'view_revenue' and not private.auth_has_role(v_member.business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.memberships
     set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(p_permission, p_allowed)
   where id = v_member.id;

  if p_permission = 'set_own_prices' and not p_allowed then
    delete from public.lesson_prices lp
     using public.instructor_profiles p
     where p.business_id = v_member.business_id
       and p.user_id = v_member.user_id
       and lp.instructor_id = p.id;
    get diagnostics v_removed = row_count;
    if v_removed > 0 then
      perform private.write_audit('instructor.own_prices_removed', 'membership', v_member.id, v_member.business_id,
        jsonb_build_object('prices', v_removed), null);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- set_lesson_prices: several prices saved together, or none (R-05, SCH-04).
--
-- With no instructor, the Business's own prices, for those who set its prices. With one, that
-- instructor's own prices: set by themselves when allowed (set_own_prices), or by those who set
-- the Business's prices. Each entry names a lesson type of the Business and a length; a price of
-- null takes that lesson off (for the Business) or goes back to the Business's price (for an
-- instructor). Prices run from £5 to £1,000 a lesson.
-- ---------------------------------------------------------------------------------------
create or replace function public.set_lesson_prices(p_business_id uuid, p_prices jsonb, p_instructor_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry jsonb;
  v_type uuid;
  v_minutes integer;
  v_price integer;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_instructor_id is null then
    if not private.auth_has_permission(p_business_id, 'set_prices') then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  else
    if not exists (select 1 from public.instructor_profiles p where p.id = p_instructor_id and p.business_id = p_business_id) then
      raise exception 'NOT_FOUND' using errcode = '42501';
    end if;
    if not (
      private.auth_has_permission(p_business_id, 'set_prices')
      or (p_instructor_id in (select private.auth_instructor_ids()) and private.auth_has_permission(p_business_id, 'set_own_prices'))
    ) then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;

  if p_prices is null or jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) not between 1 and 60 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "prices"}';
  end if;

  for v_entry in select value from jsonb_array_elements(p_prices) loop
    v_type := private.uuid_or_null(v_entry ->> 'lesson_type_id');
    v_minutes := case when jsonb_typeof(v_entry -> 'duration_minutes') = 'number' then (v_entry ->> 'duration_minutes')::numeric::integer end;
    if v_type is null or not exists (select 1 from public.lesson_types t where t.id = v_type and t.business_id = p_business_id) then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "lessonType"}';
    end if;
    if v_minutes is null or v_minutes not between 30 and 480 or v_minutes % 15 <> 0 then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
    end if;

    if v_entry -> 'price_pence' is null or jsonb_typeof(v_entry -> 'price_pence') = 'null' then
      delete from public.lesson_prices lp
       where lp.business_id = p_business_id
         and lp.lesson_type_id = v_type
         and lp.duration_minutes = v_minutes
         and lp.instructor_id is not distinct from p_instructor_id;
    else
      if jsonb_typeof(v_entry -> 'price_pence') <> 'number' then
        raise exception 'VALIDATION_FAILED' using detail = '{"field": "price"}';
      end if;
      v_price := (v_entry ->> 'price_pence')::numeric::integer;
      if v_price::numeric <> (v_entry ->> 'price_pence')::numeric or v_price not between 500 and 100000 then
        raise exception 'VALIDATION_FAILED' using detail = '{"field": "price"}';
      end if;
      insert into public.lesson_prices (business_id, lesson_type_id, instructor_id, duration_minutes, price_pence)
      values (p_business_id, v_type, p_instructor_id, v_minutes, v_price)
      on conflict (lesson_type_id, instructor_id, duration_minutes) do update set price_pence = excluded.price_pence;
    end if;
  end loop;

  perform private.write_audit('catalogue.prices_changed', 'business', p_business_id, p_business_id, null,
    jsonb_build_object('instructor_id', p_instructor_id, 'prices', p_prices));
end;
$$;

revoke all on function public.set_lesson_prices(uuid, jsonb, uuid) from public, anon;
grant execute on function public.set_lesson_prices(uuid, jsonb, uuid) to authenticated;
