-- What a learner tells us about a disability (LRN-02, NFR-PRV-01, D-180).
--
-- The product owner asked learners to be able to say whether they have a disability, condition or
-- learning difficulty, so their instructor can plan lessons that suit them. Health is special
-- category data under UK GDPR, so it is kept apart from the rest of a learner's details, in a
-- table of its own, and read only by the learner and by whoever may already see their card: the
-- instructor who teaches them and the people who run the Business they learn with (D-180). Nobody
-- else, including other instructors at the same school, and it is never asked for by anything that
-- decides whether a learner may book.
--
-- Answering is the learner's choice and the answer is theirs to change or take away: only they may
-- write this row. When it is deleted the answer goes with the account, as every other row does.

create table public.learner_health (
  user_id uuid primary key references public.users (id) on delete cascade,
  /** True when they told us there is something; false when they told us there is not. */
  has_disability boolean not null,
  details text check (char_length(details) <= 1000),
  /** When they last told us, which is when they agreed to us holding it. */
  told_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.learner_health is
  'What a learner chose to tell us about a disability (LRN-02, D-180). Special category data: the learner writes it, and only their own instructor and Business read it.';

create trigger learner_health_updated_at
  before update on public.learner_health
  for each row execute function private.set_updated_at();

alter table public.learner_health enable row level security;

grant select, insert, update, delete on public.learner_health to authenticated;

-- The learner owns it: they are the only one who may write or remove it.
create policy learner_health_select_self on public.learner_health
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy learner_health_insert_self on public.learner_health
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy learner_health_update_self on public.learner_health
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy learner_health_delete_self on public.learner_health
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Whoever may see their card may read it, which is the instructor who teaches them and the people
-- who run the Business they learn with. The same rule that shows the rest of their profile.
create policy learner_health_select_theirs on public.learner_health
  for select to authenticated
  using (private.auth_can_see_learner(user_id));

-- ---------------------------------------------------------------------------------------
-- Their own copy holds it too (NFR-PRV-03): what they told us is theirs to take away.
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
        select jsonb_build_object('has_disability', h.has_disability, 'details', h.details, 'told_at', h.told_at)
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
