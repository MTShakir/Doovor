-- Everything the product holds about one person, for them to take away (NFR-PRV-03, M6-11, D-148).
--
-- One function, run as the person asking, which is why it takes no argument: it answers about
-- whoever is signed in and nobody else. A learner's export carries their lessons, what they paid
-- and how they are getting on; an instructor's carries their profile, their hours, their area and
-- the lessons they taught. Neither carries anything private to somebody else: an instructor's
-- learners belong to the Business, and each of those learners can ask for their own.
--
-- Two things are left out on purpose. A licence number is stored as ciphertext this function cannot
-- read (D-010), so it says whether one is held rather than printing something useless. A saved
-- location is a point on a map derived from a postcode that is in the export already.
--
-- Every export is written to the audit trail (NFR-SEC-06).

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

comment on function public.export_my_data() is 'Everything held about whoever is signed in, for them to take away (NFR-PRV-03, D-148).';

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
