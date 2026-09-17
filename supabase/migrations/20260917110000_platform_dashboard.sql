-- The admin dashboard (ADM-01, M5-17).
--
-- What platform staff look at first: who signed up, which Businesses are active and teaching,
-- lessons booked and completed, the money that went through Businesses' own accounts (GMV), the
-- platform's own fees on those payments, badges waiting to be checked, and no-show disputes
-- waiting for an answer. The figures are worked out for a given moment, so the tests can hold the
-- clock still; the function the admin screens call checks who is asking and uses now (D-124).

/**
 * The dashboard for the 30 days up to a moment.
 *
 *   signups:      accounts confirmed by email or phone and made in the 30 days, by the role chosen
 *                 at sign-up; learners an instructor added who have not claimed their account are
 *                 not sign-ups (D-068).
 *   businesses:   in good standing now, by type, suspended, and those teaching in the 30 days.
 *   lessons:      booked in the 30 days (not declined or lapsed), and completed in them.
 *   money:        payments taken in the 30 days (GMV), how much of it by card, the refunds settled
 *                 in them, and the platform's fees on those payments.
 *   verification: badges waiting to be checked, and since when the oldest has waited.
 *   disputes:     no-show disputes waiting for a decision, and since when.
 */
create or replace function private.platform_dashboard_facts(p_now timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with span as (
    select p_now - interval '30 days' as from_at, p_now as to_at
  ),
  signups as (
    select count(*) filter (where u.intended_role = 'learner')::integer as learners,
           count(*) filter (where u.intended_role = 'instructor')::integer as instructors,
           count(*) filter (where u.intended_role = 'school')::integer as schools,
           count(*) filter (where u.intended_role is null)::integer as undecided
      from public.users u
      cross join span s
     where u.deleted_at is null
       and (u.email_verified_at is not null or u.phone_verified_at is not null)
       and u.created_at >= s.from_at and u.created_at < s.to_at
  ),
  businesses as (
    select count(*) filter (where b.status = 'active')::integer as active,
           count(*) filter (where b.status = 'active' and b.type = 'independent')::integer as independent,
           count(*) filter (where b.status = 'active' and b.type = 'school')::integer as schools,
           count(*) filter (where b.status = 'suspended')::integer as suspended,
           count(*) filter (
             where b.status = 'active'
               and exists (
                 select 1
                   from public.bookings k
                  where k.business_id = b.id
                    and k.status in ('confirmed', 'in_progress', 'completed', 'no_show')
                    and k.starts_at >= s.from_at and k.starts_at < s.to_at
               )
           )::integer as teaching
      from public.businesses b
      cross join span s
  ),
  lessons as (
    select count(*) filter (
             where k.created_at >= s.from_at and k.created_at < s.to_at and k.status not in ('declined', 'expired')
           )::integer as booked,
           count(*) filter (
             where k.status = 'completed' and k.starts_at >= s.from_at and k.starts_at < s.to_at
           )::integer as completed
      from public.bookings k
      cross join span s
  ),
  money as (
    select coalesce(sum(p.amount_pence), 0)::bigint as gmv_pence,
           coalesce(sum(p.amount_pence) filter (where p.method = 'card'), 0)::bigint as card_pence,
           coalesce(sum(p.fee_pence), 0)::bigint as fees_pence,
           count(*)::integer as payments
      from public.payments p
      cross join span s
     where p.status in ('paid', 'partially_refunded', 'refunded')
       -- Credit is money already counted when the package was bought.
       and p.method <> 'credit'
       and p.paid_at >= s.from_at and p.paid_at < s.to_at
  ),
  money_back as (
    select coalesce(sum(r.amount_pence), 0)::bigint as refunds_pence
      from public.refunds r
      cross join span s
     where r.status = 'succeeded'
       and r.kind in ('card', 'offline')
       and r.settled_at >= s.from_at and r.settled_at < s.to_at
  ),
  queue as (
    select count(*)::integer as waiting, min(i.verification_submitted_at) as oldest
      from public.instructor_profiles i
     where i.verification_status = 'pending'
  ),
  disputes as (
    select count(*)::integer as open, min(d.created_at) as oldest
      from public.no_show_disputes d
     where d.decided_at is null
  )
  select jsonb_build_object(
    'from', (select s.from_at from span s),
    'signups', (select jsonb_build_object('learners', x.learners, 'instructors', x.instructors, 'schools', x.schools, 'undecided', x.undecided) from signups x),
    'businesses', (select jsonb_build_object('active', x.active, 'independent', x.independent, 'schools', x.schools, 'suspended', x.suspended, 'teaching', x.teaching) from businesses x),
    'lessons', (select jsonb_build_object('booked', x.booked, 'completed', x.completed) from lessons x),
    'money', (
      select jsonb_build_object('gmv_pence', m.gmv_pence, 'card_pence', m.card_pence, 'fees_pence', m.fees_pence, 'payments', m.payments, 'refunds_pence', r.refunds_pence)
        from money m
        cross join money_back r
    ),
    'verification', (select jsonb_build_object('waiting', q.waiting, 'oldest', q.oldest) from queue q),
    'disputes', (select jsonb_build_object('open', d.open, 'oldest', d.oldest) from disputes d)
  );
$$;

revoke all on function private.platform_dashboard_facts(timestamptz) from public, anon, authenticated;

/** The dashboard now, for platform staff past their second step (ADM-01, AUTH-08). */
create or replace function public.platform_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return private.platform_dashboard_facts(now());
end;
$$;

revoke all on function public.platform_dashboard() from public, anon;
grant execute on function public.platform_dashboard() to authenticated;
