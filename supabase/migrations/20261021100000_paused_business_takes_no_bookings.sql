-- A paused Business takes no bookings (D-292, D-311).
--
-- Joining a school pauses the instructor's own Business, and the page they agree to says its profile
-- and booking link go offline. The profile did; the booking link still opened, offered its times and
-- took lessons, because both the page and the check every booking goes through refused only a
-- suspended Business. Both now refuse a paused one too, with the words a suspended one has.
--
-- private.slot_problem is the function from 20260920200000 and public.booking_page the one from
-- 20261020100000, each with the paused Business added to the suspended one.

create or replace function private.slot_problem(
  p_instructor_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_by text default 'learner',
  p_learner_id uuid default null,
  p_now timestamptz default now(),
  p_except_booking_id uuid default null,
  p_ignore_gap boolean default false
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
  -- Ignoring the gap means this lesson asks for no travel time of its own (D-187).
  v_blocked tstzrange := tstzrange(p_starts_at, v_ends_at + make_interval(mins => case when p_ignore_gap then 0 else v_buffer end), '[)');
  v_lesson tstzrange := tstzrange(p_starts_at, v_ends_at, '[)');
begin
  if p_duration_minutes is null or p_duration_minutes <= 0 then
    return 'VALIDATION_FAILED';
  end if;

  -- A suspended Business takes no lessons, from anybody (ADM-02, D-125), and nor does one its owner
  -- paused to teach under a school (D-292, D-311).
  if exists (
    select 1
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
     where i.id = p_instructor_id
       and b.status in ('suspended', 'paused')
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
       -- And that a lesson beside it is judged on when it is taught, not on the travel time
       -- after it, which the booking then gives up on that side as well (D-187).
       and (case when p_ignore_gap then tstzrange(b.starts_at, b.ends_at, '[)') else b.blocked_range end) && v_blocked
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
     and (i.badge_expiry is null or i.badge_expiry >= private.today())
     and b.status not in ('suspended', 'paused');
$$;
