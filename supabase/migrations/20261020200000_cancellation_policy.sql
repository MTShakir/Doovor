-- The cancellation policy, said before a learner books (BOK-09, R-06, R-09, D-300).
--
-- The page for learners says an instructor's cancellation policy is shown before booking, and no
-- page showed it: the booking link said nothing about cancelling, and the pay screen named a policy
-- without saying what it was. Somebody on a booking link usually has no account, and what decides
-- the policy (the platform's defaults and the Business's settings) is not theirs to read, so this
-- answers the two numbers that make it up and nothing else.
--
-- They come from private.booking_rules, which cancel_booking and mark_no_show read too, so what the
-- page says is what then happens.

/**
 * The cancellation policy a learner books an instructor under: free up to so many hours before a
 * lesson, and the share of its price that cancelling later, or missing it, costs. Answered for an
 * instructor whose booking link takes bookings, as booking_page is, and null for anybody else.
 */
create or replace function public.cancellation_policy(p_instructor_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'windowHours', (r.rules ->> 'cancellation_window_hours')::int,
           'lateFeePercent', (r.rules ->> 'late_fee_percent')::int
         )
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
    cross join lateral (select private.booking_rules(i.id) as rules) r
   where i.id = p_instructor_id
     and i.public_slug is not null
     and i.verification_status = 'approved'
     and (i.badge_expiry is null or i.badge_expiry >= private.today())
     and b.status <> 'suspended';
$$;

revoke all on function public.cancellation_policy(uuid) from public;
-- The booking link is read before anybody has an account (BOK-02).
grant execute on function public.cancellation_policy(uuid) to anon, authenticated;
