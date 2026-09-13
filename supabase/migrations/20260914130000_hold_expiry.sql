-- Holds that run out, and money that arrives too late (R-10, PAY-03, M3-06).
--
-- A Business that takes its money at booking gets the slot held while the learner pays. When
-- the hold runs out the slot goes back to the diary and the payment attempt is cancelled. A
-- payment that lands after that gets the lesson back if nobody has taken the slot, and gets
-- its money back if somebody has (ARCHITECTURE 7.4).

-- A payment attempt that was called off before any money moved.
alter type public.payment_status add value if not exists 'cancelled';

create type public.refund_kind as enum ('card', 'credit');
create type public.refund_status as enum ('pending', 'succeeded', 'failed', 'cancelled');

/**
 * Money going back (PAY-07). A row is written the moment the decision is made, and the job
 * that talks to the provider fills in what the provider called it. An automatic refund has no
 * actor: nobody asked for it, the slot had simply gone.
 */
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  learner_id uuid not null references auth.users (id) on delete cascade,
  kind public.refund_kind not null default 'card',
  provider text not null default 'stripe',
  provider_ref text,
  amount_pence integer not null check (amount_pence > 0),
  reason text not null check (char_length(reason) between 1 and 500),
  requested_by uuid references auth.users (id) on delete set null,
  status public.refund_status not null default 'pending',
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (provider, provider_ref)
);

alter table public.refunds enable row level security;

create index refunds_business_idx on public.refunds (business_id, created_at desc);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_waiting_idx on public.refunds (created_at) where status = 'pending';

-- A learner sees their own money coming back; the Business sees what it gave back. Nobody
-- writes directly: refunds are decided by RPCs and settled by the job that sends them.
create policy refunds_read_own on public.refunds
  for select to authenticated
  using (learner_id = (select auth.uid()) or private.auth_is_member(business_id));

revoke all on public.refunds from authenticated, anon;
grant select on public.refunds to authenticated;

-- ---------------------------------------------------------------------------------------
-- The attempt itself is written down, so it can be called off (R-10).
-- ---------------------------------------------------------------------------------------

/**
 * Records the payment a learner is about to make, before they make it.
 *
 * Without this the only record of an attempt is the provider's, which is no use to a job that
 * has to call one off: the payment row is what the sweep reads to find the attempt belonging
 * to a hold that has run out.
 */
create or replace function public.set_payment_intent(
  p_booking_id uuid,
  p_provider_ref text,
  p_amount_pence integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_provider_ref is null or char_length(btrim(p_provider_ref)) not between 3 and 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "providerRef"}';
  end if;
  if p_amount_pence is null or p_amount_pence <= 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "amountPence"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_booking.learner_id <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  insert into public.payments (business_id, learner_id, payer_id, booking_id, provider_ref,
                               amount_pence, method, status)
  values (v_booking.business_id, v_booking.learner_id, v_user, p_booking_id, p_provider_ref,
          p_amount_pence, 'card', 'pending')
  on conflict (provider, provider_ref) do update
    set booking_id = excluded.booking_id,
        amount_pence = case when public.payments.status = 'pending'
                            then excluded.amount_pence else public.payments.amount_pence end
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Holds that run out (R-10).
-- ---------------------------------------------------------------------------------------

/**
 * Gives back every slot whose hold has run out, and says which payment attempts to call off.
 *
 * The lesson becomes `expired` rather than cancelled: nothing was agreed and nobody called it
 * off, the time simply went back into the diary. The attempts come back to the caller, because
 * calling one off means talking to the provider, which the database does not do.
 */
create or replace function public.system_expire_payment_holds()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_ids uuid[] := '{}'::uuid[];
  v_cancel jsonb;
begin
  for v_row in
    select b.id, b.business_id
      from public.bookings b
     where b.status = 'pending_payment'
       and b.hold_expires_at is not null
       and b.hold_expires_at <= now()
       and b.payment_status not in ('paid_card', 'paid_cash', 'paid_bank', 'paid_credit')
     order by b.id
     for update skip locked
  loop
    update public.bookings
       set status = 'expired',
           payment_status = case when payment_status = 'pending' then 'unpaid' else payment_status end,
           hold_expires_at = null,
           version = version + 1
     where id = v_row.id;

    perform private.write_audit('booking.hold_expired', 'booking', v_row.id, v_row.business_id, null,
      jsonb_build_object('booking_id', v_row.id));
    perform private.enqueue_event('booking.hold_expired', jsonb_build_object('booking_id', v_row.id));

    v_ids := v_ids || v_row.id;
  end loop;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'payment_id', p.id,
             'account_id', bus.stripe_account_id,
             'intent_id', p.provider_ref
           )),
           '[]'::jsonb)
    into v_cancel
    from public.payments p
    join public.businesses bus on bus.id = p.business_id
   where p.booking_id = any (v_ids)
     and p.status = 'pending'
     and p.provider_ref is not null
     and bus.stripe_account_id is not null;

  return jsonb_build_object('expired', coalesce(array_length(v_ids, 1), 0), 'cancel', v_cancel);
end;
$$;

/** An attempt the provider has called off. No money moved, so there is nothing to give back. */
create or replace function public.system_record_payment_cancelled(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer;
begin
  update public.payments
     set status = 'cancelled'
   where id = p_payment_id
     and status = 'pending';
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Money that arrived too late (R-10, R-11).
-- ---------------------------------------------------------------------------------------

/**
 * Records a payment and works out what it bought, in one transaction (R-11).
 *
 * Idempotent on the provider's own id: the second and third deliveries of an event find the
 * payment already paid and change nothing. What happens to the lesson depends on where it is
 * by the time the money lands. Usually it is waiting, and it is confirmed. If the hold ran out
 * in the meantime the lesson is given back, unless somebody else has taken the slot, which the
 * exclusion constraint is what tells us. A lesson somebody called off is never revived: that
 * money goes back.
 */
create or replace function public.system_record_card_payment(
  p_provider_ref text,
  p_booking_id uuid,
  p_amount_pence integer,
  p_fee_pence integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_payment public.payments;
  v_payment_id uuid;
  v_outcome text;
  v_refund_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    return jsonb_build_object('applied', false, 'reason', 'booking_unknown');
  end if;

  select * into v_payment
    from public.payments
   where provider = 'stripe' and provider_ref = p_provider_ref
     for update;

  if v_payment.id is not null and v_payment.status in ('paid', 'refunded', 'partially_refunded') then
    return jsonb_build_object('applied', false, 'payment_id', v_payment.id, 'outcome', 'already');
  end if;

  if v_payment.id is null then
    insert into public.payments (business_id, learner_id, payer_id, booking_id, provider_ref,
                                 amount_pence, fee_pence, method, status, paid_at)
    values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, p_provider_ref,
            p_amount_pence, coalesce(p_fee_pence, 0), 'card', 'paid', now())
    returning id into v_payment_id;
  else
    v_payment_id := v_payment.id;
    update public.payments
       set status = 'paid',
           paid_at = now(),
           booking_id = p_booking_id,
           amount_pence = p_amount_pence,
           fee_pence = coalesce(p_fee_pence, 0)
     where id = v_payment_id;
  end if;

  if v_booking.status in ('pending_payment', 'confirmed', 'in_progress', 'completed') then
    update public.bookings
       set status = case when status = 'pending_payment' then 'confirmed' else status end,
           payment_status = 'paid_card',
           hold_expires_at = null,
           version = version + 1
     where id = p_booking_id;
    v_outcome := 'confirmed';

  elsif v_booking.status = 'expired' then
    begin
      update public.bookings
         set status = 'confirmed',
             payment_status = 'paid_card',
             hold_expires_at = null,
             version = version + 1
       where id = p_booking_id;
      v_outcome := 'revived';
    exception
      when exclusion_violation then
        v_outcome := 'slot_gone';
    end;

  else
    v_outcome := 'slot_gone';
  end if;

  if v_outcome = 'slot_gone' then
    insert into public.refunds (business_id, payment_id, booking_id, learner_id, kind, amount_pence, reason)
    values (v_booking.business_id, v_payment_id, p_booking_id, v_booking.learner_id, 'card', p_amount_pence,
            'The lesson was no longer held when the payment arrived')
    returning id into v_refund_id;

    perform private.write_audit('refund.requested', 'refund', v_refund_id, v_booking.business_id, null,
      jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id,
                         'amount_pence', p_amount_pence, 'automatic', true));
    perform private.enqueue_event('payment.refund',
      jsonb_build_object('refund_id', v_refund_id, 'payment_id', v_payment_id, 'booking_id', p_booking_id));
  else
    perform private.write_audit('payment.received', 'payment', v_payment_id, v_booking.business_id, null,
      jsonb_build_object('booking_id', p_booking_id, 'amount_pence', p_amount_pence, 'outcome', v_outcome));
    perform private.enqueue_event('payment.received',
      jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));
  end if;

  return jsonb_build_object('applied', true, 'payment_id', v_payment_id, 'outcome', v_outcome,
                            'refund_id', v_refund_id);
end;
$$;

/** What a job needs to send a refund, without it reading a tenant table to find out. */
create or replace function public.system_refund_to_send(p_refund_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'refund_id', r.id,
           'status', r.status::text,
           'kind', r.kind::text,
           'amount_pence', r.amount_pence,
           'account_id', bus.stripe_account_id,
           'intent_id', p.provider_ref,
           'booking_id', r.booking_id,
           'learner_id', r.learner_id
         )
    from public.refunds r
    join public.businesses bus on bus.id = r.business_id
    left join public.payments p on p.id = r.payment_id
   where r.id = p_refund_id;
$$;

/**
 * Writes down what the provider did with a refund. A refund already settled is left alone, so
 * a job that runs twice sends one refund and records one.
 */
create or replace function public.system_settle_refund(
  p_refund_id uuid,
  p_provider_ref text,
  p_status text default 'succeeded'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_refund public.refunds;
  v_status public.refund_status;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null then
    return jsonb_build_object('applied', false, 'reason', 'refund_unknown');
  end if;
  if v_refund.status <> 'pending' then
    return jsonb_build_object('applied', false, 'reason', 'already_settled');
  end if;

  v_status := (case p_status
                 when 'succeeded' then 'succeeded'
                 when 'failed' then 'failed'
                 when 'cancelled' then 'cancelled'
                 else 'pending'
               end)::public.refund_status;

  update public.refunds
     set provider_ref = coalesce(nullif(btrim(p_provider_ref), ''), provider_ref),
         status = v_status,
         settled_at = case when v_status = 'pending' then null else now() end
   where id = p_refund_id;

  if v_status <> 'succeeded' then
    return jsonb_build_object('applied', true, 'status', v_status::text);
  end if;

  update public.payments
     set refunded_pence = least(amount_pence, refunded_pence + v_refund.amount_pence),
         status = case when refunded_pence + v_refund.amount_pence >= amount_pence
                       then 'refunded'::public.payment_status
                       else 'partially_refunded'::public.payment_status end
   where id = v_refund.payment_id;

  -- A lesson that is still on keeps its paid status: the money that went back was for
  -- something else, which is what a partial refund of a fee is (PAY-09).
  if v_refund.booking_id is not null then
    update public.bookings
       set payment_status = case when payment_status = 'paid_card' then 'refunded' else payment_status end,
           version = version + 1
     where id = v_refund.booking_id
       and status not in ('pending_payment', 'confirmed', 'in_progress', 'completed');
  end if;

  perform private.write_audit('refund.settled', 'refund', p_refund_id, v_refund.business_id, null,
    jsonb_build_object('provider_ref', p_provider_ref, 'amount_pence', v_refund.amount_pence));
  perform private.enqueue_event('payment.refunded',
    jsonb_build_object('refund_id', p_refund_id, 'booking_id', v_refund.booking_id,
                       'amount_pence', v_refund.amount_pence));

  return jsonb_build_object('applied', true, 'status', 'succeeded');
end;
$$;

/**
 * The webhook says what a payment event meant, now that a payment can mean more than one
 * thing (R-11, M3-06). The outcome is what `provider_events` keeps, so support can see at a
 * glance which payments arrived too late and what happened to them.
 *
 * This is the same function as in 20260914120000 with the succeeded case widened.
 */
create or replace function public.system_process_stripe_event(
  p_event_id text,
  p_event_type text,
  p_account_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_outcome text;
  v_changed integer := 0;
  v_booking uuid;
  v_result jsonb;
begin
  if p_event_id is null or char_length(btrim(p_event_id)) = 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "eventId"}';
  end if;

  insert into public.provider_events (provider, event_id, event_type, account_id)
  values ('stripe', p_event_id, coalesce(p_event_type, 'unknown'), nullif(p_account_id, ''))
  on conflict (provider, event_id) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('applied', false, 'outcome', 'duplicate');
  end if;

  v_booking := nullif(p_payload -> 'metadata' ->> 'booking_id', '')::uuid;

  case p_event_type
    when 'account.updated' then
      v_changed := public.system_set_payments_state(
        coalesce(nullif(p_account_id, ''), p_payload ->> 'id'),
        (p_payload ->> 'charges_enabled')::boolean,
        (p_payload ->> 'payouts_enabled')::boolean,
        (p_payload ->> 'details_submitted')::boolean
      );
      v_outcome := case when v_changed > 0 then 'account_updated' else 'account_unknown' end;

    when 'payment_intent.succeeded' then
      if v_booking is null then
        v_outcome := 'no_booking';
      else
        v_result := public.system_record_card_payment(
          p_payload ->> 'id',
          v_booking,
          (p_payload ->> 'amount_received')::int,
          coalesce((p_payload ->> 'application_fee_amount')::int, 0)
        );
        v_outcome := case
          when not (v_result ->> 'applied')::boolean then coalesce(v_result ->> 'reason', 'payment_already_recorded')
          when v_result ->> 'outcome' = 'slot_gone' then 'payment_refunded'
          when v_result ->> 'outcome' = 'revived' then 'payment_recorded_late'
          else 'payment_recorded'
        end;
      end if;

    when 'payment_intent.payment_failed' then
      if v_booking is null then
        v_outcome := 'no_booking';
      else
        perform public.system_record_failed_payment(
          p_payload ->> 'id', v_booking, (p_payload ->> 'amount')::int
        );
        v_outcome := 'payment_failed';
      end if;

    else
      v_outcome := 'recorded';
  end case;

  update public.provider_events
     set processed_at = now(), outcome = v_outcome
   where id = v_id;

  return jsonb_build_object('applied', true, 'outcome', v_outcome);
end;
$$;

revoke all on function public.set_payment_intent(uuid, text, integer) from public, anon;
revoke all on function public.system_expire_payment_holds() from public, anon, authenticated;
revoke all on function public.system_record_payment_cancelled(uuid) from public, anon, authenticated;
revoke all on function public.system_refund_to_send(uuid) from public, anon, authenticated;
revoke all on function public.system_settle_refund(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_payment_intent(uuid, text, integer) to authenticated;
grant execute on function public.system_expire_payment_holds() to service_role;
grant execute on function public.system_record_payment_cancelled(uuid) to service_role;
grant execute on function public.system_refund_to_send(uuid) to service_role;
grant execute on function public.system_settle_refund(uuid, text, text) to service_role;
revoke all on function public.system_process_stripe_event(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.system_process_stripe_event(text, text, text, jsonb) to service_role;
