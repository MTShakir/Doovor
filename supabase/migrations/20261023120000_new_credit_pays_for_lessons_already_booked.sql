-- New credit pays for the lessons already booked, soonest first (PAY-04, D-385).
--
-- Credit was spent only when a lesson was booked, so a package bought, or recorded as paid in
-- person, did nothing for the lessons already in the diary: a learner with ten weekly lessons
-- booked who paid for ten hours had ten hours of credit and ten lessons still to pay, and was
-- asked for each of them by card. The product owner decided that new credit pays for those
-- first.
--
-- Which lessons: their lessons with that Business still to come, booked outright, with nothing
-- paid for them yet and no card payment under way, soonest first, until the credit runs out. Each
-- is paid the way a booking is paid from credit (D-225): in full where there is enough, and where
-- there is not, the minutes there are, with the rest left to pay the usual way. A request, or a
-- lesson held while somebody pays for it, is left to the card it is waiting on; a lesson that has
-- happened is left too, because money for it may well have changed hands already without being
-- written down, and paying it again from credit would take it twice. A lesson already part paid
-- by credit keeps the split it was told about, the rest of it in money.

create or replace function private.spend_credit_on_booked_lessons(p_business_id uuid, p_learner_id uuid, p_actor_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking_id uuid;
  v_paid integer := 0;
begin
  for v_booking_id in
    select b.id
      from public.bookings b
     where b.business_id = p_business_id
       and b.learner_id = p_learner_id
       and b.status = 'confirmed'
       and b.payment_status = 'unpaid'
       and b.credit_minutes = 0
       and b.price_pence > 0
       and b.starts_at > now()
       and not exists (
         select 1 from public.payments p
          where p.booking_id = b.id
            and p.status in ('pending', 'authorised', 'paid', 'partially_refunded')
       )
     order by b.starts_at, b.id
       for update of b
  loop
    exit when private.lock_usable_credit(p_business_id, p_learner_id) <= 0;
    perform private.pay_with_credit(v_booking_id, p_actor_id);
    v_paid := v_paid + 1;
  end loop;

  return v_paid;
end;
$$;

revoke all on function private.spend_credit_on_booked_lessons(uuid, uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------
-- Every lot bought, online or in person, spends itself on what is booked before anything else.
-- ---------------------------------------------------------------------------------------
create or replace function private.add_credit_lot(
  p_business_id uuid,
  p_learner_id uuid,
  p_minutes integer,
  p_price_pence integer,
  p_payment_id uuid,
  p_package_id uuid,
  p_expires_at timestamptz,
  p_early_start_requested_at timestamptz,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id uuid;
begin
  perform private.credit_account_for(p_business_id, p_learner_id);

  insert into public.credit_lots (business_id, learner_id, package_id, payment_id, minutes_total, price_pence,
                                  expires_at, early_start_requested_at, created_by)
  values (p_business_id, p_learner_id, p_package_id, p_payment_id, p_minutes, p_price_pence,
          p_expires_at, p_early_start_requested_at, p_actor_id)
  returning id into v_lot_id;

  insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, payment_id, actor_id)
  values (p_business_id, p_learner_id, v_lot_id, 'purchase', p_minutes, p_payment_id, p_actor_id);

  -- The lessons already booked come first (D-385).
  perform private.spend_credit_on_booked_lessons(p_business_id, p_learner_id, p_actor_id);

  return v_lot_id;
end;
$$;

revoke all on function private.add_credit_lot(uuid, uuid, integer, integer, uuid, uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
