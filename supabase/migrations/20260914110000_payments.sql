-- Paying for a lesson by card (PAY-02, PAY-03, R-10, R-11, M3-05).
--
-- The platform never holds the money (PAY-12): the payment happens on the Business's own
-- connected account and this records what happened. A payment row is written by the webhook,
-- once, because `provider_ref` is unique: the second delivery of an event finds it there.

create type public.payment_method as enum ('card', 'cash', 'bank', 'credit');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'partially_refunded');

/** Who a learner is to a Business's payment account, so their cards follow them (PAY-02). */
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  learner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text not null,
  created_at timestamptz not null default now(),
  unique (business_id, learner_id),
  unique (provider, provider_customer_id)
);

alter table public.billing_customers enable row level security;

create policy billing_customers_read_own on public.billing_customers
  for select to authenticated
  using (learner_id = (select auth.uid()) or private.auth_is_member(business_id));

revoke all on public.billing_customers from authenticated, anon;
grant select on public.billing_customers to authenticated;

/** Money that moved, or tried to (PAY-02, PAY-05, PAY-08). Integer pence, always. */
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  learner_id uuid not null references auth.users (id) on delete cascade,
  /** Who actually paid, which is not always the learner (PAY-10). */
  payer_id uuid references auth.users (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  provider text not null default 'stripe',
  /** The provider's own id for it. Unique, so one payment is recorded once (R-11). */
  provider_ref text,
  amount_pence integer not null check (amount_pence > 0),
  /** What the provider kept. Zero until a marketplace fee applies (PAY-01, Phase 3). */
  fee_pence integer not null default 0 check (fee_pence >= 0),
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  refunded_pence integer not null default 0 check (refunded_pence >= 0),
  receipt_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (provider, provider_ref)
);

alter table public.payments enable row level security;

create index payments_business_idx on public.payments (business_id, created_at desc);
create index payments_booking_idx on public.payments (booking_id);

-- A learner sees what they paid; the Business sees what it took. Nobody writes directly:
-- payments are written by the webhook and by the RPCs that record offline money (PAY-05).
create policy payments_read_own on public.payments
  for select to authenticated
  using (learner_id = (select auth.uid()) or payer_id = (select auth.uid()) or private.auth_is_member(business_id));

revoke all on public.payments from authenticated, anon;
grant select on public.payments to authenticated;

-- ---------------------------------------------------------------------------------------
-- Holding a slot while somebody pays for it (R-10).
-- ---------------------------------------------------------------------------------------

/**
 * The payment mode a Business works to (PAY-03). Pay at booking is the default, but it only
 * applies once the Business can actually take a card: until then, booking works as it did.
 */
create or replace function private.payment_mode(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not b.stripe_charges_enabled then 'offline'
    else coalesce(b.settings ->> 'payment_mode', 'at_booking')
  end
    from public.businesses b
   where b.id = p_business_id;
$$;

/**
 * Turns a learner's own booking into one that is waiting to be paid for (R-10).
 *
 * The slot is held for fifteen minutes, which is long enough to find a card and short enough
 * that a slot is never lost to somebody who wandered off. The hold blocks other bookings,
 * because `pending_payment` is one of the statuses that occupy a time (D-002).
 */
create or replace function public.hold_booking_for_payment(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_mode text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_booking.learner_id <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_booking.status not in ('confirmed', 'pending_payment') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.payment_status in ('paid_card', 'paid_cash', 'paid_bank', 'paid_credit') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "payment_status"}';
  end if;

  v_mode := private.payment_mode(v_booking.business_id);
  if v_mode <> 'at_booking' then
    -- Nothing to hold: this Business takes its money some other way.
    return jsonb_build_object('held', false, 'mode', v_mode, 'amount_pence', v_booking.price_pence);
  end if;

  update public.bookings
     set status = 'pending_payment',
         payment_mode = 'at_booking',
         payment_status = 'pending',
         hold_expires_at = now() + interval '15 minutes',
         version = version + 1
   where id = p_booking_id;

  return jsonb_build_object(
    'held', true,
    'mode', v_mode,
    'amount_pence', v_booking.price_pence,
    'hold_expires_at', now() + interval '15 minutes'
  );
end;
$$;

/** Where a learner's cards live for one Business, written the first time they pay it. */
create or replace function public.set_billing_customer(p_business_id uuid, p_customer_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_customer_id is null or char_length(btrim(p_customer_id)) not between 3 and 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "customerId"}';
  end if;

  insert into public.billing_customers (business_id, learner_id, provider_customer_id)
  values (p_business_id, v_user, p_customer_id)
  on conflict (business_id, learner_id) do update set provider_customer_id = excluded.provider_customer_id
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- What the webhook does when money actually moves (R-11).
-- ---------------------------------------------------------------------------------------

/**
 * Records a payment and confirms what it was for, in one transaction. Idempotent on the
 * provider's own id: the second and third deliveries of an event change nothing.
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
  v_payment_id uuid;
  v_already boolean := false;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    return jsonb_build_object('applied', false, 'reason', 'booking_unknown');
  end if;

  insert into public.payments (business_id, learner_id, payer_id, booking_id, provider_ref,
                               amount_pence, fee_pence, method, status, paid_at)
  values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, p_provider_ref,
          p_amount_pence, coalesce(p_fee_pence, 0), 'card', 'paid', now())
  on conflict (provider, provider_ref) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    v_already := true;
    select id into v_payment_id from public.payments where provider = 'stripe' and provider_ref = p_provider_ref;
  end if;

  -- The lesson is on, and the hold it was keeping is over.
  update public.bookings
     set status = case when status = 'pending_payment' then 'confirmed' else status end,
         payment_status = 'paid_card',
         hold_expires_at = null,
         version = version + 1
   where id = p_booking_id
     and payment_status <> 'paid_card';

  if not v_already then
    perform private.write_audit('payment.received', 'payment', v_payment_id, v_booking.business_id, null,
      jsonb_build_object('booking_id', p_booking_id, 'amount_pence', p_amount_pence));
    perform private.enqueue_event('payment.received',
      jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));
  end if;

  return jsonb_build_object('applied', not v_already, 'payment_id', v_payment_id);
end;
$$;

/** A card that was refused. The lesson keeps its hold until the hold runs out (R-10). */
create or replace function public.system_record_failed_payment(
  p_provider_ref text,
  p_booking_id uuid,
  p_amount_pence integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_payment_id uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    return jsonb_build_object('applied', false, 'reason', 'booking_unknown');
  end if;

  insert into public.payments (business_id, learner_id, payer_id, booking_id, provider_ref,
                               amount_pence, method, status)
  values (v_booking.business_id, v_booking.learner_id, v_booking.learner_id, p_booking_id, p_provider_ref,
          p_amount_pence, 'card', 'failed')
  on conflict (provider, provider_ref) do update set status = 'failed'
  returning id into v_payment_id;

  update public.bookings set payment_status = 'failed', version = version + 1
   where id = p_booking_id and payment_status = 'pending';

  perform private.enqueue_event('payment.failed',
    jsonb_build_object('payment_id', v_payment_id, 'booking_id', p_booking_id));

  return jsonb_build_object('applied', true, 'payment_id', v_payment_id);
end;
$$;

revoke all on function public.hold_booking_for_payment(uuid) from public, anon;
revoke all on function public.set_billing_customer(uuid, text) from public, anon;
revoke all on function public.system_record_card_payment(text, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.system_record_failed_payment(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.hold_booking_for_payment(uuid) to authenticated;
grant execute on function public.set_billing_customer(uuid, text) to authenticated;
grant execute on function public.system_record_card_payment(text, uuid, integer, integer) to service_role;
grant execute on function public.system_record_failed_payment(text, uuid, integer) to service_role;
