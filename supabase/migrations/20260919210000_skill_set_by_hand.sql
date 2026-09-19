-- A skill set on the map by hand (PRG-02, PRG-03, D-169).
--
-- The product owner asked for instructors to update a learner's skill map straight from the
-- progress page, by tapping an area. Until now a rating came only from a lesson's record. One set by
-- hand is kept here, beside the lesson ratings, and the map takes whichever of the two came last.

create table public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  learner_id uuid not null references public.users (id) on delete cascade,
  instructor_id uuid references public.instructor_profiles (id) on delete set null,
  assessed_by uuid references public.users (id) on delete set null,
  skill_code text not null references public.skills (code),
  rating smallint not null check (rating between 1 and 5),
  assessed_at timestamptz not null default now()
);

create index skill_assessments_learner_idx on public.skill_assessments (learner_id, skill_code, assessed_at desc);

comment on table public.skill_assessments is
  'A skill area rated on the map by hand rather than in a lesson record (PRG-02, D-169). Written by rate_skill only.';

alter table public.skill_assessments enable row level security;
grant select on public.skill_assessments to authenticated;

-- Read by the same people as a lesson record: the learner, the Business's owners and managers, the
-- instructor who set it or who teaches the learner there, and platform staff.
create policy skill_assessments_select_learner on public.skill_assessments
  for select to authenticated
  using (learner_id = (select auth.uid()));

create policy skill_assessments_select_business_admins on public.skill_assessments
  for select to authenticated
  using (business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[])));

create policy skill_assessments_select_instructor on public.skill_assessments
  for select to authenticated
  using (
    instructor_id in (select private.auth_instructor_ids())
    or exists (
      select 1
        from public.learner_relationships lr
       where lr.business_id = skill_assessments.business_id
         and lr.learner_id = skill_assessments.learner_id
         and lr.instructor_id in (select private.auth_instructor_ids())
    )
  );

create policy skill_assessments_select_staff on public.skill_assessments
  for select to authenticated
  using ((select private.auth_is_staff()));

-- Setting one: the instructor the learner is with, or the Business's owner or manager.
create or replace function public.rate_skill(p_learner_id uuid, p_skill_code text, p_rating integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_relationship public.learner_relationships;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "rating"}';
  end if;
  if p_skill_code is null or not exists (select 1 from public.skills s where s.code = p_skill_code) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "skill"}';
  end if;

  -- The caller's own place in the learner's life: where they teach them, or a Business they run.
  select lr.* into v_relationship
    from public.learner_relationships lr
   where lr.learner_id = p_learner_id
     and (
       lr.instructor_id in (select private.auth_instructor_ids())
       or private.auth_has_role(lr.business_id, array['owner', 'manager']::public.membership_role[])
     )
   order by (lr.instructor_id in (select private.auth_instructor_ids())) desc
   limit 1;
  if v_relationship.learner_id is null then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  insert into public.skill_assessments (business_id, learner_id, instructor_id, assessed_by, skill_code, rating)
  values (
    v_relationship.business_id,
    p_learner_id,
    (select p.id from public.instructor_profiles p
      where p.user_id = v_user and p.business_id = v_relationship.business_id limit 1),
    v_user,
    p_skill_code,
    p_rating
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.rate_skill(uuid, text, integer) from public, anon;
grant execute on function public.rate_skill(uuid, text, integer) to authenticated;

-- The map: each area at its latest rating, from a lesson's record or set by hand, whichever came
-- last. A lesson's rating is dated when the lesson was, one set by hand when it was set.
create or replace view public.skill_progress
with (security_invoker = true)
as
with ratings as (
  select sr.learner_id, sr.skill_code, sr.rating, r.lesson_starts_at as rated_at, r.id as tiebreak
    from public.skill_ratings sr
    join public.lesson_records r on r.id = sr.lesson_record_id
  union all
  select a.learner_id, a.skill_code, a.rating, a.assessed_at, a.id
    from public.skill_assessments a
)
select distinct on (learner_id, skill_code)
       learner_id,
       skill_code,
       rating,
       rated_at as last_rated_at,
       (count(*) over (partition by learner_id, skill_code))::integer as times
  from ratings
 order by learner_id, skill_code, rated_at desc, tiebreak desc;

comment on view public.skill_progress is
  'Each area a learner has been rated in, at its latest rating from a lesson record or set by hand (PRG-03, D-169). Made of what the reader may read.';

-- The learner's own export carries what was set by hand too (NFR-PRV-03).
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_out jsonb;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select jsonb_strip_nulls(jsonb_build_object(
    'exported_at', now(),
    'account_id', v_user,
    'account', (
      select jsonb_build_object(
        'email', u.email,
        'email_verified_at', u.email_verified_at,
        'phone', u.phone,
        'phone_verified_at', u.phone_verified_at,
        'full_name', u.full_name,
        'locale', u.locale,
        'timezone', u.timezone,
        'intended_role', u.intended_role,
        'marketing_consent', u.marketing_consent,
        'marketing_consent_at', u.marketing_consent_at,
        'analytics_consent', u.analytics_consent,
        'created_at', u.created_at
      )
        from public.users u where u.id = v_user
    ),
    'learner', case when exists (select 1 from public.learner_profiles p where p.user_id = v_user) then jsonb_build_object(
      'profile', (
        select jsonb_build_object(
          'postcode', p.postcode,
          'transmission', p.transmission,
          'experience_level', p.experience_level,
          'provisional_licence_confirmed', p.provisional_licence_confirmed,
          'created_at', p.created_at
        )
          from public.learner_profiles p where p.user_id = v_user
      ),
      'private', (
        select jsonb_build_object(
          'date_of_birth', lp.date_of_birth,
          'licence_number_held', lp.licence_number_encrypted is not null
        )
          from public.learner_private lp where lp.user_id = v_user
      ),
      'businesses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'business', b.name,
          'status', r.status,
          'joined_at', r.created_at,
          'instructor', i.display_name
        ) order by r.created_at), '[]'::jsonb)
          from public.learner_relationships r
          join public.businesses b on b.id = r.business_id
          left join public.instructor_profiles i on i.id = r.instructor_id
         where r.learner_id = v_user
      ),
      'lessons', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'starts_at', k.starts_at,
          'ends_at', k.ends_at,
          'status', k.status,
          'payment_status', k.payment_status,
          'price_pence', k.price_pence,
          'source', k.source,
          'instructor', i.display_name,
          'business', b.name
        ) order by k.starts_at), '[]'::jsonb)
          from public.bookings k
          join public.instructor_profiles i on i.id = k.instructor_id
          join public.businesses b on b.id = k.business_id
         where k.learner_id = v_user
      ),
      'progress', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'lesson_at', k.starts_at,
          'summary', lr.summary,
          'next_focus', lr.next_focus,
          'homework', lr.homework,
          'saved_at', lr.created_at,
          'skills', (
            select coalesce(jsonb_agg(jsonb_build_object('skill', sr.skill_code, 'rating', sr.rating) order by sr.skill_code), '[]'::jsonb)
              from public.skill_ratings sr where sr.lesson_record_id = lr.id
          )
        ) order by k.starts_at), '[]'::jsonb)
          from public.lesson_records lr
          join public.bookings k on k.id = lr.booking_id
         where k.learner_id = v_user
      ),
      -- Where an instructor set a skill on the map, rather than in a lesson's record (PRG-02, D-169).
      'skill_updates', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'skill', a.skill_code,
          'rating', a.rating,
          'set_at', a.assessed_at
        ) order by a.assessed_at), '[]'::jsonb)
          from public.skill_assessments a
         where a.learner_id = v_user
      ),
      'payments', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'paid_at', pm.created_at,
          'amount_pence', pm.amount_pence,
          'method', pm.method,
          'status', pm.status,
          'business', b.name
        ) order by pm.created_at), '[]'::jsonb)
          from public.payments pm
          join public.businesses b on b.id = pm.business_id
         where pm.learner_id = v_user
      ),
      'refunds', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'refunded_at', rf.created_at,
          'amount_pence', rf.amount_pence,
          'reason', rf.reason,
          'status', rf.status
        ) order by rf.created_at), '[]'::jsonb)
          from public.refunds rf
          join public.payments pm on pm.id = rf.payment_id
         where pm.learner_id = v_user
      ),
      'credit', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'bought_at', cl.created_at,
          'minutes', cl.minutes_total,
          'minutes_left', cl.minutes_remaining,
          'expires_at', cl.expires_at,
          'business', b.name
        ) order by cl.created_at), '[]'::jsonb)
          from public.credit_lots cl
          join public.businesses b on b.id = cl.business_id
         where cl.learner_id = v_user
      )
    ) end,
    'instructor', case when exists (select 1 from public.instructor_profiles i where i.user_id = v_user) then jsonb_build_object(
      'profiles', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'display_name', i.display_name,
          'booking_link', i.public_slug,
          'business', b.name,
          'qualification', i.qualification,
          'badge_number', i.badge_number,
          'badge_expiry', i.badge_expiry,
          'verification_status', i.verification_status,
          'base_postcode', i.base_postcode,
          'radius_miles', i.radius_miles,
          'transmission', i.transmission,
          'languages', i.languages,
          'bio', i.bio,
          'listed', i.is_listed,
          'created_at', i.created_at
        ) order by i.created_at), '[]'::jsonb)
          from public.instructor_profiles i
          join public.businesses b on b.id = i.business_id
         where i.user_id = v_user
      ),
      'working_hours', (
        select coalesce(jsonb_agg(jsonb_build_object('weekday', w.weekday, 'from', w.start_time, 'to', w.end_time) order by w.weekday, w.start_time), '[]'::jsonb)
          from public.working_hours w
          join public.instructor_profiles i on i.id = w.instructor_id
         where i.user_id = v_user
      ),
      'lessons_taught', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'starts_at', k.starts_at,
          'ends_at', k.ends_at,
          'status', k.status,
          'payment_status', k.payment_status,
          'price_pence', k.price_pence
        ) order by k.starts_at), '[]'::jsonb)
          from public.bookings k
          join public.instructor_profiles i on i.id = k.instructor_id
         where i.user_id = v_user
      )
    ) end,
    'memberships', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'business', b.name,
        'role', m.role,
        'status', m.status,
        'joined_at', m.created_at
      ) order by m.created_at), '[]'::jsonb)
        from public.memberships m
        join public.businesses b on b.id = m.business_id
       where m.user_id = v_user
    ),
    'notifications', jsonb_build_object(
      'preferences', (
        select coalesce(jsonb_agg(jsonb_build_object('about', np.category, 'channel', np.channel, 'wanted', np.enabled) order by np.category, np.channel), '[]'::jsonb)
          from public.notification_preferences np where np.user_id = v_user
      ),
      'recent', (
        select coalesce(jsonb_agg(jsonb_build_object('kind', n.kind, 'sent_at', n.created_at, 'read_at', n.read_at) order by n.created_at desc), '[]'::jsonb)
          from public.notifications n where n.user_id = v_user
      )
    ),
    'what_you_did', (
      select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'at', a.occurred_at) order by a.occurred_at desc), '[]'::jsonb)
        from public.audit_log a where a.actor_user_id = v_user
    )
  )) into v_out;

  perform private.write_audit('account.data_exported', 'user', v_user, null, null, null);
  return v_out;
end;
$$;
