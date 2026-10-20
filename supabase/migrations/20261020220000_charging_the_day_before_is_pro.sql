-- Charging the saved card the day before is Pro (PAY-03, PRD 9.18, D-302).
--
-- The pricing page sold it as part of Pro, as PRD 9.18 and D-022 say, and nothing checked it:
-- Payment setup offered it on every plan, and set_payment_mode took it from any owner. On
-- 20 October 2026 the product owner chose to keep it for Pro, the way set_brand_colour keeps a
-- Business's own colour (D-210).
--
-- A Business that drops to Free keeps what it chose, so nothing is lost and it need not choose
-- again. Until it is on a plan that carries it, private.payment_mode answers 'at_booking' for it,
-- and every booking function reads that, so its new lessons are paid at booking. Lessons it booked
-- to be charged the day before keep the terms they were booked on (PAY-03): the day-before charge
-- reads each lesson's own payment_mode, never the plan.
--
-- Which plans carry it lives in packages/config/src/plans.ts as `autoChargeBeforeLesson`. This
-- mirrors it, because a rule enforced only in TypeScript is a rule anybody with a session can walk
-- around. private.payment_mode is the function from 20260914110000, and set_payment_mode the one
-- from 20260914170000, each with the plan added.

create or replace function private.payment_mode(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not b.stripe_charges_enabled then 'offline'
    when b.settings ->> 'payment_mode' = 'before_lesson' and b.plan = 'free' then 'at_booking'
    else coalesce(b.settings ->> 'payment_mode', 'at_booking')
  end
    from public.businesses b
   where b.id = p_business_id;
$$;

/**
 * Chooses how learners pay this Business (PAY-03). Owners only, like everything else about the
 * Business's money (PRD 6), written to the audit log, and charging the day before only on a plan
 * that carries it (D-302).
 */
create or replace function public.set_payment_mode(p_business_id uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_before text;
  v_plan public.plan_key;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('at_booking', 'before_lesson', 'after_lesson', 'offline') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "mode"}';
  end if;
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select coalesce(settings ->> 'payment_mode', 'at_booking'), plan into v_before, v_plan
    from public.businesses
   where id = p_business_id
     for update;

  if p_mode = 'before_lesson' and v_plan = 'free' then
    raise exception 'PLAN_REQUIRED';
  end if;

  update public.businesses
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('payment_mode', p_mode)
   where id = p_business_id;

  if v_before is distinct from p_mode then
    perform private.write_audit('business.payment_mode_changed', 'business', p_business_id, p_business_id,
      jsonb_build_object('payment_mode', v_before), jsonb_build_object('payment_mode', p_mode));
  end if;

  return p_mode;
end;
$$;
