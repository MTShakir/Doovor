-- Getting started, one question at a time (LRN-02, NFR-PRV-01, D-183).
--
-- The product owner asked a learner to be walked through a few things once they have signed up:
-- where they are collected, a disability, which gearbox, medication that could affect their
-- driving, and whether they have passed the theory test. Every one of them may be skipped, and
-- every one is on their Account afterwards, so the walk-through only saves them finding it.
--
-- Medication is health data, so it sits with the disability answer, in the table apart from the
-- rest of their details, read by the learner and by whoever may already see their card (D-180).
-- The rest is ordinary profile data. Nothing here is required, and nothing here decides whether
-- a learner may book.

-- A row used to mean "they answered about a disability". Now it can hold medication instead, so
-- the disability answer may be absent, and a row that says nothing at all is not worth keeping.
alter table public.learner_health alter column has_disability drop not null;

alter table public.learner_health
  add column takes_medication boolean,
  add column medication_details text check (char_length(medication_details) <= 1000);

alter table public.learner_health
  add constraint learner_health_says_something
  check (has_disability is not null or takes_medication is not null);

comment on column public.learner_health.has_disability is
  'True when they told us there is something, false when they told us there is not, null when they have not said (D-183).';
comment on column public.learner_health.takes_medication is
  'True when they told us they take medication that could affect their driving, false when they told us they do not, null when they have not said (D-183).';
comment on column public.learner_health.medication_details is
  'What they chose to say about it. Asked for only where it could affect their driving (D-183).';

-- Passed within the last two years, which is how long a theory pass lasts, so it is asked again
-- rather than dated: a learner who answers yes today is a learner whose pass is still good.
alter table public.learner_profiles
  add column theory_passed boolean,
  add column setup_skipped text[] not null default '{}'
    check (setup_skipped <@ array['pickup', 'disability', 'gearbox', 'medication', 'theory']);

comment on column public.learner_profiles.theory_passed is
  'True when they told us they passed the theory test within the last two years, false when not yet, null when they have not said (D-183).';
comment on column public.learner_profiles.setup_skipped is
  'The getting-started questions they chose to skip, so nothing asks them twice (D-183). Theirs to answer later on their Account.';

grant update (theory_passed, setup_skipped) on public.learner_profiles to authenticated;

-- ---------------------------------------------------------------------------------------
-- Their own copy holds the new answers too (NFR-PRV-03).
-- ---------------------------------------------------------------------------------------
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
          'theory_passed', p.theory_passed,
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
      -- What they told us about a disability, which is theirs to change or take away (D-180).
      'health', (
        select jsonb_build_object(
          'has_disability', h.has_disability,
          'details', h.details,
          'takes_medication', h.takes_medication,
          'medication_details', h.medication_details,
          'told_at', h.told_at
        )
          from public.learner_health h
         where h.user_id = v_user
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

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
