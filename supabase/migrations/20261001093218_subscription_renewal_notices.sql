-- Who to warn that Pro is about to renew (9.18, D-231, D-237).
--
-- A subscription renews by itself and takes money. UK law expects notice before that happens, and
-- the PRD's own promise is a fortnight on a year and three days on a month. This is the read the
-- daily job makes: everything renewing inside its own notice window.
--
-- The window is worked out here rather than passed in, so a job that asked for the wrong number
-- of days could not make us warn somebody too late. 'incomplete' and 'canceled' are not here at
-- all: nothing is renewing. Nor is anything already set to stop, because nobody needs warning
-- about a charge that is not coming.

create or replace function public.system_subscriptions_renewing(p_now timestamptz default now())
returns table (
  business_id uuid,
  owner_user_id uuid,
  billing_interval public.billing_interval,
  renews_at timestamptz,
  months_paid integer
)
language sql
security definer
set search_path = ''
as $$
  select s.business_id,
         m.user_id,
         s.billing_interval,
         s.current_period_end,
         s.months_paid
    from public.subscriptions s
    join public.memberships m on m.business_id = s.business_id and m.role = 'owner'
   where s.status in ('trialing', 'active')
     and not s.cancel_at_period_end
     and s.current_period_end is not null
     and s.current_period_end > p_now
     and s.current_period_end <= p_now + case
           when s.billing_interval = 'year' then interval '14 days'
           else interval '3 days'
         end;
$$;

comment on function public.system_subscriptions_renewing(timestamptz) is
  'Subscriptions inside their own renewal notice window (9.18, D-237).';

revoke all on function public.system_subscriptions_renewing(timestamptz) from public, anon, authenticated;
grant execute on function public.system_subscriptions_renewing(timestamptz) to service_role;
