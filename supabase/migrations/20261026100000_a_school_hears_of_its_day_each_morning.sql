-- A school hears of the lessons booked in a morning digest, and of its money only where it may see
-- revenue (PRD Appendix B, PRD 6.2, D-392, D-393).
--
-- Every lesson booked at a school was pushed and emailed to its owner and to each of its managers,
-- one message a lesson: twenty instructors make hundreds a week. Appendix B gives a school a manager
-- digest of bookings, so a lesson booked now reaches the school's inbox only (packages/core), and
-- this sums up each school's lessons booked in a day for the next morning, as
-- `system_daily_payment_summaries` sums up its money.
--
-- That summary of money went to every manager, though a manager sees the school's revenue only if
-- the owner allows it (view_revenue, D-120). It now goes to the owner and to managers who may.

/**
 * Each school's lessons booked between two moments, by instructor, and who runs it. Lessons that are
 * still on or have been taught; one booked and called off the same day was never in the diary to
 * speak of, and one still waiting for an answer or a payment is not booked yet.
 */
create function public.system_daily_booking_summaries(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'business_id', bus.id,
           'business_name', bus.name,
           'count', totals.lessons,
           'instructors', totals.instructors,
           'user_ids', (
             select coalesce(jsonb_agg(m.user_id order by m.user_id), '[]'::jsonb)
               from public.memberships m
              where m.business_id = bus.id
                and m.status = 'active'
                and m.role in ('owner', 'manager')
           )
         ) order by bus.id), '[]'::jsonb)
    from (
      select per.business_id,
             sum(per.lessons)::integer as lessons,
             jsonb_agg(jsonb_build_object('name', per.name, 'count', per.lessons) order by per.lessons desc, per.name) as instructors
        from (
          select b.business_id, i.id, i.display_name as name, count(*)::integer as lessons
            from public.bookings b
            join public.instructor_profiles i on i.id = b.instructor_id
           where b.created_at >= p_from
             and b.created_at < p_to
             and b.status in ('confirmed', 'in_progress', 'completed', 'no_show')
           group by b.business_id, i.id, i.display_name
        ) as per
       group by per.business_id
    ) as totals
    join public.businesses bus on bus.id = totals.business_id
   where bus.type = 'school';
$$;

/** The function from 20260914320000_payment_notifications, told only to those who may see revenue. */
create or replace function public.system_daily_payment_summaries(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'business_id', bus.id,
           'business_name', bus.name,
           'total_pence', totals.total_pence,
           'count', totals.payments,
           'user_ids', (
             select coalesce(jsonb_agg(m.user_id order by m.user_id), '[]'::jsonb)
               from public.memberships m
              where m.business_id = bus.id
                and m.status = 'active'
                and (
                  m.role = 'owner'
                  or (m.role = 'manager'
                      and coalesce(m.permissions -> 'view_revenue' = 'true'::jsonb, private.role_permission_default(m.role, 'view_revenue')))
                )
           )
         ) order by bus.id), '[]'::jsonb)
    from (
      select p.business_id, sum(p.amount_pence)::integer as total_pence, count(*)::integer as payments
        from public.payments p
       where p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= p_from and p.paid_at < p_to
       group by p.business_id
    ) as totals
    join public.businesses bus on bus.id = totals.business_id
   where bus.type = 'school';
$$;

revoke all on function public.system_daily_booking_summaries(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.system_daily_booking_summaries(timestamptz, timestamptz) to service_role;
