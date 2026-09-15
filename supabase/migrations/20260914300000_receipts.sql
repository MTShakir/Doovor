-- Receipts (PAY-08, M3-20).
--
-- Every payment a learner makes to a Business gets a receipt: a number of its own, one after
-- another for that Business; the Business's name, address and VAT number as they were when it was
-- issued; what was paid for; and, for a Business registered for VAT, the VAT in the price. A job
-- issues it once the payment is received and emails it to the learner, and a receipt page shows it
-- to them and to the Business. A payment recorded in person can be taken back out for ten minutes
-- (D-089), so its receipt waits until then, and no number is ever spent on a payment that goes.

-- One counter per Business, kept where no screen can see or change it.
create table private.receipt_counters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  last_number integer not null default 0 check (last_number >= 0)
);

create type public.receipt_kind as enum ('lesson', 'late_cancellation_fee', 'no_show_fee', 'credit', 'other');

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  -- Not by cascade: a receipt outlives nothing it was for (NFR-PRV-03), and a payment with a
  -- receipt is past the point it could be taken back out.
  payment_id uuid not null unique references public.payments (id),
  learner_id uuid not null references auth.users (id) on delete cascade,
  number integer not null check (number > 0),
  issued_at timestamptz not null default now(),
  -- What it says, as it was when it was issued: a receipt does not change when the Business does.
  business_name text not null check (char_length(business_name) between 1 and 120),
  business_address jsonb check (business_address is null or jsonb_typeof(business_address) = 'object'),
  vat_number text,
  vat_rate_percent integer check (vat_rate_percent between 0 and 100),
  vat_pence integer check (vat_pence >= 0),
  amount_pence integer not null check (amount_pence > 0),
  method public.payment_method not null,
  kind public.receipt_kind not null,
  lesson_starts_at timestamptz,
  lesson_minutes integer check (lesson_minutes > 0),
  lesson_type text,
  instructor_name text,
  credit_minutes integer check (credit_minutes > 0),
  emailed_at timestamptz,
  unique (business_id, number),
  -- VAT is shown only for a Business registered for it, and then always (PAY-08).
  check ((vat_number is null) = (vat_pence is null) and (vat_pence is null) = (vat_rate_percent is null)),
  check (vat_pence is null or vat_pence <= amount_pence)
);

create index receipts_learner_idx on public.receipts (learner_id, issued_at desc);

alter table public.receipts enable row level security;

-- The learner, whoever paid for them, the people who run the Business, the instructor who
-- teaches the learner, and platform staff. Nobody writes one: they are issued below.
create policy receipts_read on public.receipts
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or exists (select 1 from public.payments p where p.id = payment_id and p.payer_id = (select auth.uid()))
    or business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or exists (
      select 1 from private.auth_instructor_learners() as taught
       where taught.business_id = receipts.business_id
         and taught.learner_id = receipts.learner_id
    )
    or (select private.auth_is_staff())
  );

revoke all on public.receipts from authenticated, anon;
grant select on public.receipts to authenticated;

/** The standard rate of VAT, which driving lessons are charged at (PAY-08). */
create or replace function private.vat_rate_percent()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 20;
$$;

/**
 * Issues the receipt for a payment (PAY-08): the next number for its Business, and what the receipt
 * says as of now. Once per payment: asking again answers with the one already issued.
 *
 * Returns what the job needs to email it, including who to, or `wait_until` for a payment recorded
 * in person in the last ten minutes, which can still be taken back out (D-089). Null for anything
 * that has no receipt: no such payment, or one not received.
 */
create or replace function public.system_issue_receipt(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_receipt public.receipts;
  v_business public.businesses;
  v_booking public.bookings;
  v_credit_minutes integer;
  v_number integer;
  v_vat_rate integer;
  v_kind public.receipt_kind;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null or v_payment.status not in ('paid', 'partially_refunded', 'refunded') then
    return null;
  end if;
  if v_payment.provider = 'offline' and v_payment.created_at > now() - interval '10 minutes' then
    return jsonb_build_object('wait_until', v_payment.created_at + interval '10 minutes');
  end if;

  select * into v_receipt from public.receipts where payment_id = p_payment_id;
  if v_receipt.id is null then
    select * into v_business from public.businesses where id = v_payment.business_id;
    select * into v_booking from public.bookings where id = v_payment.booking_id;
    select minutes_total into v_credit_minutes from public.credit_lots where payment_id = p_payment_id;

    v_kind := case
      when v_credit_minutes is not null then 'credit'
      when v_booking.id is null then 'other'
      when v_booking.status = 'no_show' and coalesce(v_booking.fee_pence, 0) > 0 and v_payment.amount_pence <= v_booking.fee_pence then 'no_show_fee'
      when v_booking.status = 'cancelled' and coalesce(v_booking.fee_pence, 0) > 0 and v_payment.amount_pence <= v_booking.fee_pence then 'late_cancellation_fee'
      else 'lesson'
    end::public.receipt_kind;

    insert into private.receipt_counters as counter (business_id, last_number)
    values (v_payment.business_id, 1)
    on conflict (business_id) do update set last_number = counter.last_number + 1
    returning last_number into v_number;

    v_vat_rate := case when nullif(btrim(coalesce(v_business.vat_number, '')), '') is null then null else private.vat_rate_percent() end;

    insert into public.receipts (business_id, payment_id, learner_id, number, business_name, business_address,
                                 vat_number, vat_rate_percent, vat_pence, amount_pence, method, kind,
                                 lesson_starts_at, lesson_minutes, lesson_type, instructor_name, credit_minutes)
    values (v_payment.business_id, p_payment_id, v_payment.learner_id, v_number, v_business.name, v_business.address,
            case when v_vat_rate is null then null else btrim(v_business.vat_number) end,
            v_vat_rate,
            -- VAT in a price that includes it, to the nearest penny.
            case when v_vat_rate is null then null
                 else round(v_payment.amount_pence * v_vat_rate / (100.0 + v_vat_rate))::integer end,
            v_payment.amount_pence, v_payment.method, v_kind,
            v_booking.starts_at,
            case when v_booking.id is null then null
                 else (extract(epoch from v_booking.ends_at - v_booking.starts_at) / 60)::integer end,
            (select t.name from public.lesson_types t where t.id = v_booking.lesson_type_id),
            (select i.display_name from public.instructor_profiles i where i.id = v_booking.instructor_id),
            v_credit_minutes)
    returning * into v_receipt;

    perform private.write_audit('receipt.issued', 'receipt', v_receipt.id, v_receipt.business_id, null,
      jsonb_build_object('payment_id', p_payment_id, 'number', v_receipt.number, 'amount_pence', v_receipt.amount_pence));
  end if;

  return to_jsonb(v_receipt) || jsonb_build_object(
    'learner_email', (select u.email from public.users u where u.id = v_receipt.learner_id),
    'learner_name', (select u.full_name from public.users u where u.id = v_receipt.learner_id)
  );
end;
$$;

/** A receipt the job has emailed, so running it again sends nothing. */
create or replace function public.system_mark_receipt_emailed(p_receipt_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.receipts set emailed_at = now() where id = p_receipt_id and emailed_at is null returning id
  )
  select exists (select 1 from marked);
$$;

-- ---------------------------------------------------------------------------------------
-- The balance says which payments have a receipt, so both screens can link to it.
-- learner_balance is the function from 20260914280000 with that added.
-- ---------------------------------------------------------------------------------------

create or replace function public.learner_balance(p_business_id uuid, p_learner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not (
    p_learner_id = v_user
    or p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or exists (
      select 1 from private.auth_instructor_learners() as taught
       where taught.business_id = p_business_id
         and taught.learner_id = p_learner_id
    )
    or private.auth_is_staff()
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'credit_minutes', coalesce((
      select sum(l.minutes_remaining)::integer
        from public.credit_lots l
       where l.business_id = p_business_id
         and l.learner_id = p_learner_id
         and l.minutes_remaining > 0
         and (l.expires_at is null or l.expires_at > now())
    ), 0),

    -- Lessons that could be owed for, and lessons called off late or nobody came to whose fee
    -- nobody has paid.
    -- Which of them are owed, and since when, is decided in core.
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'starts_at', b.starts_at,
               'ends_at', b.ends_at,
               'status', b.status,
               'payment_status', b.payment_status,
               'payment_mode', b.payment_mode,
               'price_pence', b.price_pence,
               'fee_pence', coalesce(b.fee_pence, 0),
               'cancelled_at', b.cancelled_at,
               'instructor_id', b.instructor_id,
               'instructor_name', i.display_name
             ) order by b.starts_at)
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
       where b.business_id = p_business_id
         and b.learner_id = p_learner_id
         and (
           (b.status in ('confirmed', 'in_progress', 'completed')
            and b.payment_status in ('unpaid', 'pending', 'failed')
            and b.price_pence > 0)
           or (b.status in ('cancelled', 'no_show')
               and coalesce(b.fee_pence, 0) > 0
               and b.payment_status in ('unpaid', 'failed'))
         )
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          -- What is on its way back or owed back already, so nobody is offered a refund of nothing.
          select p.id, coalesce(p.paid_at, p.created_at) as at, p.amount_pence, p.method, p.refunded_pence,
                 (select coalesce(sum(r.amount_pence), 0)::integer
                    from public.refunds r
                   where r.payment_id = p.id and r.status = 'pending') as pending_refund_pence,
                 b.starts_at as lesson_at, l.minutes_total as credit_minutes,
                 exists (select 1 from public.receipts r where r.payment_id = p.id) as has_receipt
            from public.payments p
            left join public.bookings b on b.id = p.booking_id
            left join public.credit_lots l on l.payment_id = p.id
           where p.business_id = p_business_id
             and p.learner_id = p_learner_id
             and p.status in ('paid', 'refunded', 'partially_refunded')
           order by coalesce(p.paid_at, p.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    'refunds', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          -- The lesson it was for, and whose it was: cash owed back is handed back by them (M3-18).
          select r.id, coalesce(r.settled_at, r.created_at) as at, r.amount_pence, r.status, r.kind,
                 b.starts_at as lesson_at, b.instructor_id
            from public.refunds r
            left join public.bookings b on b.id = r.booking_id
           where r.business_id = p_business_id
             and r.learner_id = p_learner_id
           order by coalesce(r.settled_at, r.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    -- What happened to credit other than buying it, which is a payment above.
    'credit', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          select m.id, m.created_at as at, m.kind as move, m.minutes, b.starts_at as lesson_at
            from public.credit_ledger m
            left join public.bookings b on b.id = m.booking_id
           where m.business_id = p_business_id
             and m.learner_id = p_learner_id
             and m.kind <> 'purchase'
           order by m.created_at desc
           limit 50
        ) as recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.vat_rate_percent() from public, anon, authenticated;
revoke all on function public.system_issue_receipt(uuid) from public, anon, authenticated;
revoke all on function public.system_mark_receipt_emailed(uuid) from public, anon, authenticated;
grant execute on function public.system_issue_receipt(uuid) to service_role;
grant execute on function public.system_mark_receipt_emailed(uuid) to service_role;
