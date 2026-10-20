-- A school vouches for its own instructors (M9-03, D-280).
--
-- The platform checks an independent instructor's badge against its photo before their profile goes live
-- (INS-02). A school's instructors are the school's to vouch for, as the product owner decided on
-- 20 October 2026 (D-278): their profile is live from the moment it exists, they are never asked for
-- a photo, and nobody on the platform reviews them. Their badge number and expiry are still kept, for the
-- reminders before it runs out (INS-03) and for what a trainee may do (INS-04).
--
-- A vouched profile is an approved one, so everything that already waits for approval (search, the
-- profile page, the booking link, open times, the school's page, the gallery and allocation) treats
-- it as live without changing. `vouched_at` is what says the school, not the platform, cleared it, so the
-- public pages give the platform's tick only to a badge the platform checked.

alter table public.instructor_profiles
  add column vouched_at timestamptz;

comment on column public.instructor_profiles.vouched_at is
  'When the school this instructor teaches for vouched for them in place of the platform checking their badge (D-280).';

-- ---------------------------------------------------------------------------------------
-- Every profile made at a school is vouched for as it is made, whichever way it is made: an
-- instructor accepting the school's invitation, staff, or the seed.
-- ---------------------------------------------------------------------------------------
create function private.school_vouches_for_instructor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verification_status = 'unsubmitted'
     and exists (select 1 from public.businesses b where b.id = new.business_id and b.type = 'school') then
    new.verification_status := 'approved';
    new.vouched_at := now();
  end if;
  return new;
end;
$$;

create trigger instructor_profiles_school_vouches
  before insert on public.instructor_profiles
  for each row
  execute function private.school_vouches_for_instructor();

-- ---------------------------------------------------------------------------------------
-- The school instructors already here who were waiting for the platform, or had not sent a badge: vouched
-- for now. A photo sent for checking is nobody's any more, so the nightly housekeeping removes it
-- (D-158). A badge the platform has already decided on stays as it was.
-- ---------------------------------------------------------------------------------------
update public.instructor_profiles p
   set verification_status = 'approved',
       vouched_at = now(),
       badge_path = null,
       verification_decision_reason = null
  from public.businesses b
 where b.id = p.business_id
   and b.type = 'school'
   and p.verification_status in ('unsubmitted', 'pending');

-- ---------------------------------------------------------------------------------------
-- submit_verification: a school's instructor sends their badge's details without a photo, and the
-- profile stays vouched for rather than waiting for the platform. Everybody else is unchanged (D-262).
-- ---------------------------------------------------------------------------------------
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
  v_number text := regexp_replace(coalesce(p_badge_number, ''), '\s', '', 'g');
  v_business uuid;
  v_school boolean;
  v_before jsonb;
  v_stored_path text;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_profile_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_number !~ '^[0-9]{5,7}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeNumber"}';
  end if;
  if p_badge_expiry is null or p_badge_expiry <= private.today() then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgeExpiry"}';
  end if;
  -- Teaching a learner requires a current enhanced check.
  if p_dbs_confirmed is not true then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dbsConfirmed"}';
  end if;
  -- What a canvas writes: WebP, or PNG where the browser cannot write WebP (D-224).
  if p_badge_path is not null and p_badge_path !~ ('^' || p_profile_id::text || '/[a-z0-9-]{8,64}\.(webp|png)$') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgePath"}';
  end if;

  -- One badge, one account (INS-02, D-230). The index is what actually guarantees it; this is here
  -- so the screen can say something useful instead of showing a constraint violation. Before the
  -- photo, because "that badge is already here" is the more useful thing to be told.
  if exists (
    select 1
      from public.instructor_profiles other
     where other.id <> p_profile_id
       and upper(btrim(coalesce(other.badge_number, ''))) = v_number
  ) then
    raise exception 'BADGE_TAKEN' using errcode = 'P0001';
  end if;

  select p.business_id,
         p.badge_path,
         b.type = 'school',
         jsonb_build_object(
           'qualification', p.qualification,
           'badge_number', p.badge_number,
           'verification_status', p.verification_status
         )
    into v_business, v_stored_path, v_school, v_before
    from public.instructor_profiles p
    join public.businesses b on b.id = p.business_id
   where p.id = p_profile_id;

  -- A school vouches for its own instructors (D-280): their details are kept, for the reminders and
  -- what a trainee may do, with no photo and nobody on the platform to look at it.
  if v_school then
    update public.instructor_profiles
       set qualification = p_qualification,
           badge_number = v_number,
           badge_expiry = p_badge_expiry,
           badge_path = null,
           dbs_confirmed_at = now(),
           verification_status = 'approved',
           verification_decision_reason = null,
           vouched_at = coalesce(vouched_at, now())
     where id = p_profile_id;

    perform private.write_audit(
      'instructor.badge_vouched', 'instructor_profile', p_profile_id, v_business, v_before,
      jsonb_build_object('qualification', p_qualification, 'badge_number', v_number, 'verification_status', 'approved')
    );
    return 'approved'::public.verification_status;
  end if;

  -- A badge is checked from its photo: the one sent now, or one still on file from before. A
  -- decision clears the photo (D-158), so sending again after one needs a new photo.
  if p_badge_path is null and v_stored_path is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "badgePath"}';
  end if;

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

-- ---------------------------------------------------------------------------------------
-- booking_page, now saying whether the platform checked the badge itself: its tick is for a badge it
-- checked, at a Business of one, not for one a school vouched for.
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
     -- for (INS-02, D-280), whose badge is still in date (INS-03), at a Business not suspended (ADM-02).
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= private.today())
     and b.status <> 'suspended';
$$;
