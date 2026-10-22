-- Lessons booked every week in one go are told about once (NTF-03, BOK-05, D-349).
--
-- Booking a learner every week for four weeks wrote four lessons, and each was told about on its
-- own: four notices, four emails and four pushes to the learner, and the same again to the
-- instructor when the school's office booked them. Twelve weeks was twelve of each. The notice
-- for a lesson now says whether it went in with others every week, so the first of them can say
-- so for all of them, and the rest say nothing.

create or replace function public.system_booking_notice(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'booking_id', b.id,
    'business_id', b.business_id,
    'status', b.status::text,
    'version', b.version,
    'starts_at', b.starts_at,
    'ends_at', b.ends_at,
    'price_pence', b.price_pence,
    'fee_pence', b.fee_pence,
    'payment_mode', b.payment_mode::text,
    'payment_status', b.payment_status::text,
    'late_cancellation', coalesce(b.late_cancellation, false),
    'cancel_reason', b.cancel_reason,
    -- Lessons booked every week in one go, which are told about once, by the first of them (D-349):
    -- how many went in together, whether this is the first, and the last. Those a plan books later,
    -- a week at a time, were not written with it, and are told about one by one as before.
    'series', (
      select jsonb_build_object('count', count(*), 'first', min(x.starts_at) = b.starts_at, 'last_starts_at', max(x.starts_at))
        from public.booking_recurrences r
        join public.bookings x on x.recurrence_id = r.id and x.created_at = r.created_at
       where r.id = b.recurrence_id
         and b.created_at = r.created_at
    ),
    'learner_user_id', b.learner_id,
    'learner_name', l.full_name,
    'instructor_user_id', i.user_id,
    'instructor_name', i.display_name,
    'school_user_ids', coalesce(
      (select jsonb_agg(m.user_id)
         from public.memberships m
         join public.businesses bu on bu.id = m.business_id
        where m.business_id = b.business_id
          and m.status = 'active'
          and m.role in ('owner', 'manager')
          and bu.type = 'school'
          and m.user_id <> i.user_id),
      '[]'::jsonb
    )
  )
    from public.bookings b
    join public.instructor_profiles i on i.id = b.instructor_id
    join public.users l on l.id = b.learner_id
   where b.id = p_booking_id;
$$;
