-- Finding, suspending and reactivating a Business (ADM-02, M5-18).
--
-- Platform staff past their second step find a Business by its name, its postcode, or the name,
-- email or mobile of anybody who runs it, and open it. A super admin suspends one, saying why, and
-- reactivates it. A suspended Business takes no bookings and no card payments from anybody: the
-- check sits in the one place every new or moved lesson and every free time passes through, and
-- in the hold a card payment starts with. Its booking link and public pages go (they already
-- showed only Businesses in good standing), the people who work there lose its portal (they
-- already lost its permissions, M0), and they cannot start another Business meanwhile. Lessons
-- already booked stay booked, for the Business or staff to sort out with the learners (D-125).

-- Why and by whom, kept private: none of these is granted to anybody signed in (D-123).
alter table public.businesses
  add column suspended_at timestamptz,
  add column suspended_by uuid references auth.users (id) on delete set null,
  add column suspension_reason text check (suspension_reason is null or char_length(suspension_reason) between 1 and 500);

-- ---------------------------------------------------------------------------------------
-- Nothing new is booked or paid for at a suspended Business.
-- ---------------------------------------------------------------------------------------

create or replace function private.slot_problem(
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_by text default 'learner',
  p_learner_id uuid default null,
  p_now timestamptz default now(),
  p_except_booking_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb := private.booking_rules(p_instructor_id);
  v_buffer integer := coalesce((v_rules ->> 'buffer_minutes')::int, 30);
  v_notice integer := coalesce((v_rules ->> 'notice_hours')::int, 24);
  v_horizon integer := coalesce((v_rules ->> 'horizon_weeks')::int, 8);
  v_ends_at timestamptz := p_starts_at + make_interval(mins => p_duration_minutes);
  v_blocked tstzrange := tstzrange(p_starts_at, v_ends_at + make_interval(mins => v_buffer), '[)');
  v_lesson tstzrange := tstzrange(p_starts_at, v_ends_at, '[)');
begin
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    return 'VALIDATION_FAILED';
  end if;

  -- A suspended Business takes no lessons, from anybody (ADM-02, D-125).
  if exists (
    select 1
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
     where i.id = p_instructor_id
       and b.status = 'suspended'
  ) then
    return 'BUSINESS_SUSPENDED';
  end if;

  -- Somebody switched off at their Business teaches nobody there (SCH-02, D-120).
  if not exists (
    select 1
      from public.instructor_profiles i
      join public.memberships m on m.business_id = i.business_id and m.user_id = i.user_id and m.status = 'active'
     where i.id = p_instructor_id
  ) then
    return 'INSTRUCTOR_INACTIVE';
  end if;

  if exists (
    select 1 from public.bookings b
     where b.instructor_id = p_instructor_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.blocked_range && v_blocked
       and (p_except_booking_id is null or b.id <> p_except_booking_id)
  ) then
    return 'SLOT_TAKEN';
  end if;

  if p_learner_id is not null and exists (
    select 1 from public.bookings b
     where b.learner_id = p_learner_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.learner_range && v_lesson
       and (p_except_booking_id is null or b.id <> p_except_booking_id)
  ) then
    return 'LEARNER_BUSY';
  end if;

  -- An instructor books what they like in their own diary, as long as it is free (R-04).
  if p_by = 'instructor' then
    return null;
  end if;

  if p_starts_at < p_now + make_interval(hours => v_notice) then
    return 'NOTICE_TOO_SHORT';
  end if;
  if p_starts_at > p_now + make_interval(weeks => v_horizon) then
    return 'BEYOND_HORIZON';
  end if;
  if not private.is_open(p_instructor_id, p_starts_at, v_ends_at) then
    return 'OUTSIDE_AVAILABILITY';
  end if;

  return null;
end;
$$;

create or replace function public.hold_booking_for_payment(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_mode text;
  v_hold timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_booking.learner_id <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Card payments start here, and a suspended Business takes none (ADM-02, D-125).
  if exists (select 1 from public.businesses b where b.id = v_booking.business_id and b.status = 'suspended') then
    raise exception 'BUSINESS_SUSPENDED';
  end if;
  if v_booking.status not in ('confirmed', 'pending_payment', 'in_progress', 'completed') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.payment_status in ('paid_card', 'paid_cash', 'paid_bank', 'paid_credit') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment_status"}';
  end if;

  v_mode := private.payment_mode(v_booking.business_id);
  -- Only a lesson still to come, at a Business that takes its money at booking, has a slot to
  -- hold. Anything else is paid for as it stands.
  if v_mode <> 'at_booking'
     or v_booking.status in ('in_progress', 'completed')
     or v_booking.payment_mode in ('before_lesson', 'after_lesson') then
    return jsonb_build_object('held', false, 'mode', v_mode, 'amount_pence', v_booking.price_pence);
  end if;

  update public.bookings
     set status = 'pending_payment',
         payment_mode = 'at_booking',
         payment_status = 'pending',
         hold_expires_at = coalesce(hold_expires_at, now() + interval '15 minutes'),
         version = version + 1
   where id = p_booking_id
  returning hold_expires_at into v_hold;

  return jsonb_build_object(
    'held', true,
    'mode', v_mode,
    'amount_pence', v_booking.price_pence,
    'hold_expires_at', v_hold
  );
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
     and (i.badge_expiry is null or i.badge_expiry >= current_date)
     and b.status <> 'suspended';
$$;

create or replace function public.create_business(p_type public.business_type, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_offer jsonb;
  v_limit int;
  v_used bigint;
  v_plan public.plan_key := 'free'::public.plan_key;
  v_business uuid;
  v_display_name text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "name"}';
  end if;
  -- Somebody whose Business is suspended does not start another one meanwhile (ADM-02, D-125).
  if exists (
    select 1 from public.memberships m join public.businesses b on b.id = m.business_id
     where m.user_id = v_user and b.status = 'suspended'
  ) then
    raise exception 'BUSINESS_SUSPENDED';
  end if;
  if p_type = 'independent' and exists (
    select 1 from public.memberships m join public.businesses b on b.id = m.business_id
     where m.user_id = v_user and b.type = 'independent'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_independent"}';
  end if;

  -- Serialise founding offer allocation so the limits cannot be overshot.
  perform pg_advisory_xact_lock(hashtext('founding_offer'));
  select value into v_offer from public.platform_settings where key = 'founding_offer';
  v_limit := coalesce((v_offer ->> case when p_type = 'school' then 'school_limit' else 'instructor_limit' end)::int, 0);
  select count(*) into v_used from public.businesses where founding_offer and type = p_type;
  if v_used < v_limit then
    v_plan := case when p_type = 'school' then 'school'::public.plan_key else 'pro'::public.plan_key end;
  end if;

  insert into public.businesses (type, name, slug, plan, plan_expires_at, founding_offer, created_by, onboarding_completed_at)
  values (
    p_type, v_name, private.unique_slug(v_name, 'businesses'), v_plan,
    case when v_plan <> 'free' then now() + make_interval(months => coalesce((v_offer ->> 'months')::int, 12)) end,
    v_plan <> 'free', v_user,
    case when p_type = 'independent' then now() end
  )
  returning id into v_business;

  insert into public.memberships (business_id, user_id, role) values (v_business, v_user, 'owner');

  if p_type = 'independent' then
    select left(coalesce(nullif(trim(full_name), ''), v_name), 80) into v_display_name from public.users where id = v_user;
    insert into public.instructor_profiles (user_id, business_id, display_name, public_slug)
    values (v_user, v_business, v_display_name, private.unique_slug(v_display_name, 'instructor_profiles'));
  end if;

  update public.users
     set intended_role = case when p_type = 'school' then 'school'::public.intended_role else 'instructor'::public.intended_role end
   where id = v_user;

  perform private.write_audit('business.created', 'business', v_business, v_business, null,
    jsonb_build_object('type', p_type, 'plan', v_plan, 'founding_offer', v_plan <> 'free'));
  return v_business;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Finding and opening a Business, for platform staff.
-- ---------------------------------------------------------------------------------------

/** What is typed, as a pattern that finds it anywhere in a name, with % and _ taken as themselves. */
create or replace function private.contains_pattern(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

/** A mobile as typed ("07700 900123", "+44 7700 900123") in the digits Auth keeps, or null if too short to mean one. */
create or replace function private.phone_digits(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when char_length(d) < 6 then null
           when d like '0%' then '44' || substr(d, 2)
           else d
         end
    from (select regexp_replace(coalesce(p_text, ''), '\D', '', 'g') as d) as x;
$$;

/**
 * Businesses for platform staff to find (ADM-02): by part of the name or address, the postcode
 * however it is spaced, or the name, email or mobile of anybody who works there. Newest first, and
 * the newest when nothing is typed.
 */
create or replace function public.admin_businesses(p_query text default null, p_limit integer default 25)
returns table (
  business_id uuid,
  name text,
  type public.business_type,
  status public.business_status,
  base_postcode text,
  owner_name text,
  owner_email text,
  instructors integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_pattern text;
  v_squashed text;
  v_digits text := private.phone_digits(p_query);
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if char_length(v_query) > 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "query"}';
  end if;
  v_pattern := private.contains_pattern(v_query);
  v_squashed := private.contains_pattern(replace(v_query, ' ', ''));

  return query
    select b.id,
           b.name,
           b.type,
           b.status,
           b.base_postcode,
           o.full_name,
           o.email,
           (select count(*)::integer
              from public.instructor_profiles i
              join public.memberships m on m.business_id = i.business_id and m.user_id = i.user_id and m.status = 'active'
             where i.business_id = b.id),
           b.created_at
      from public.businesses b
      left join lateral (
        select u.full_name, u.email
          from public.memberships m
          join public.users u on u.id = m.user_id
         where m.business_id = b.id and m.role = 'owner'
         order by m.created_at
         limit 1
      ) as o on true
     where v_query is null
        or b.name ilike v_pattern
        or b.slug ilike v_pattern
        or replace(coalesce(b.base_postcode, ''), ' ', '') ilike v_squashed
        or exists (
          select 1
            from public.memberships m
            join public.users u on u.id = m.user_id
           where m.business_id = b.id
             and (
               u.full_name ilike v_pattern
               or u.email ilike v_pattern
               or (v_digits is not null and regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
             )
        )
     order by b.created_at desc, b.id
     limit least(greatest(coalesce(p_limit, 25), 1), 50);
end;
$$;

revoke all on function public.admin_businesses(text, integer) from public, anon;
grant execute on function public.admin_businesses(text, integer) to authenticated;

/**
 * One Business as platform staff see it (ADM-02): its standing, and if suspended why, by whom and
 * when; everybody who works there; its learners and lessons to come; whether it takes cards.
 * Null for a Business that does not exist.
 */
create or replace function public.admin_business(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'business_id', b.id,
           'name', b.name,
           'type', b.type,
           'status', b.status,
           'base_postcode', b.base_postcode,
           'created_at', b.created_at,
           'takes_cards', b.stripe_charges_enabled,
           'suspended_at', b.suspended_at,
           'suspension_reason', b.suspension_reason,
           'suspended_by_name', (select u.full_name from public.users u where u.id = b.suspended_by),
           'members', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'user_id', m.user_id,
                          'name', coalesce(nullif(btrim(u.full_name), ''), i.display_name),
                          'email', u.email,
                          'phone', u.phone,
                          'role', m.role,
                          'active', m.status = 'active',
                          'verification_status', i.verification_status
                        )
                        order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, coalesce(nullif(btrim(u.full_name), ''), i.display_name)
                      )
                 from public.memberships m
                 join public.users u on u.id = m.user_id
                 left join public.instructor_profiles i on i.business_id = m.business_id and i.user_id = m.user_id
                where m.business_id = b.id
             ),
             '[]'::jsonb
           ),
           'learners', (
             select count(*)::integer from public.learner_relationships r
              where r.business_id = b.id and r.status = 'active'
           ),
           'lessons_to_come', (
             select count(*)::integer from public.bookings k
              where k.business_id = b.id
                and k.status in ('requested', 'pending_payment', 'confirmed')
                and k.starts_at > now()
           )
         )
    into v_result
    from public.businesses b
   where b.id = p_business_id;

  return v_result;
end;
$$;

revoke all on function public.admin_business(uuid) from public, anon;
grant execute on function public.admin_business(uuid) to authenticated;

/**
 * A super admin past their second step suspends a Business, saying why, or reactivates one
 * (ADM-02, D-125). Audited either way (NFR-SEC-06).
 */
create or replace function public.admin_set_business_suspended(p_business_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business public.businesses;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff('super') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_suspended is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "suspended"}';
  end if;

  select * into v_business from public.businesses where id = p_business_id for update;
  if v_business.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if p_suspended then
    if v_reason is null or char_length(v_reason) > 500 then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
    end if;
    if v_business.status = 'suspended' then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_suspended"}';
    end if;
    update public.businesses
       set status = 'suspended', suspended_at = now(), suspended_by = v_user, suspension_reason = v_reason, updated_at = now()
     where id = p_business_id;
    perform private.write_audit('business.suspended', 'business', p_business_id, p_business_id,
      jsonb_build_object('status', v_business.status),
      jsonb_build_object('status', 'suspended', 'reason', v_reason));
  else
    if v_business.status <> 'suspended' then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_suspended"}';
    end if;
    update public.businesses
       set status = 'active', suspended_at = null, suspended_by = null, suspension_reason = null, updated_at = now()
     where id = p_business_id;
    perform private.write_audit('business.reactivated', 'business', p_business_id, p_business_id,
      jsonb_build_object('status', 'suspended', 'reason', v_business.suspension_reason),
      jsonb_build_object('status', 'active'));
  end if;
end;
$$;

revoke all on function public.admin_set_business_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_business_suspended(uuid, boolean, text) to authenticated;
