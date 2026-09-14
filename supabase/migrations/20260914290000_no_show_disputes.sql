-- Disputing a no-show (R-09, M3-19).
--
-- A learner marked as a no-show can say it was wrong for seven days after it was marked
-- (`bookings.dispute_until`, 20260914280000). They say what happened; the lesson's instructor and
-- the people who run the Business see it; and an owner or manager decides. Waiving the fee gives
-- back whatever paid it, the way it came: credit to the lots it was kept from, money to the card
-- through the refund job or owed back for cash and transfers, and a fee still owed is owed no
-- more. Keeping it changes nothing but the dispute. Deciding is giving money back, so it is for
-- the same people who can refund (PRD 6.2, D-091).

create type public.no_show_dispute_outcome as enum ('waived', 'kept');

create table public.no_show_disputes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  learner_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  outcome public.no_show_dispute_outcome,
  note text check (note is null or char_length(note) between 1 and 1000),
  -- Decided means an outcome and when; undecided means neither.
  check ((decided_at is null) = (outcome is null))
);

create index no_show_disputes_business_idx on public.no_show_disputes (business_id, created_at desc);
create index no_show_disputes_learner_idx on public.no_show_disputes (learner_id);

alter table public.no_show_disputes enable row level security;

-- The learner who disputed, the people who run the Business, and the instructor whose lesson it
-- was. Nobody writes directly: disputes are raised and decided by the functions below.
create policy no_show_disputes_read on public.no_show_disputes
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or exists (
      select 1 from public.bookings b
       where b.id = booking_id
         and b.instructor_id in (select private.auth_instructor_ids())
    )
    or (select private.auth_is_staff())
  );

revoke all on public.no_show_disputes from authenticated, anon;
grant select on public.no_show_disputes to authenticated;

/**
 * A learner disputes being marked as a no-show (R-09): their own lesson, while the seven days
 * are open, once. Returns the dispute.
 */
create or replace function public.dispute_no_show(p_booking_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 1 and 1000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_booking.learner_id <> v_user then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_booking.status <> 'no_show' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;
  if v_booking.dispute_until is null or now() > v_booking.dispute_until then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dispute_until"}';
  end if;
  if exists (select 1 from public.no_show_disputes where booking_id = p_booking_id) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "dispute"}';
  end if;

  insert into public.no_show_disputes (business_id, booking_id, learner_id, reason)
  values (v_booking.business_id, p_booking_id, v_user, v_reason)
  returning id into v_id;

  perform private.write_audit('no_show.disputed', 'booking', p_booking_id, v_booking.business_id, null,
    jsonb_build_object('dispute_id', v_id));
  -- Identifiers only: what the learner wrote stays in the database (ARCHITECTURE 9).
  perform private.enqueue_event('booking.disputed', jsonb_build_object('booking_id', p_booking_id, 'dispute_id', v_id));

  return v_id;
end;
$$;

/**
 * An owner or manager decides a dispute (R-09): `waived` gives back whatever paid the fee, the way
 * it came, and leaves nothing owed; `kept` leaves the fee as it is. With a note for the learner, if
 * they want. Once.
 */
create or replace function public.decide_no_show_dispute(p_dispute_id uuid, p_outcome text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_dispute public.no_show_disputes;
  v_booking public.bookings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fee_row record;
  v_credit_back integer := 0;
  v_money jsonb := jsonb_build_object('card_refund_pence', 0, 'offline_refund_pence', 0, 'kept_pence', 0);
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('waived', 'kept') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "outcome"}';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "note"}';
  end if;

  select * into v_dispute from public.no_show_disputes where id = p_dispute_id for update;
  if v_dispute.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_can_refund(v_dispute.business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_dispute.decided_at is not null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "decided"}';
  end if;

  select * into v_booking from public.bookings where id = v_dispute.booking_id for update;

  if p_outcome = 'waived' then
    -- Credit kept as the fee goes back to the lots it came from, by hand and with a reason.
    perform private.lock_usable_credit(v_booking.business_id, v_booking.learner_id);
    for v_fee_row in
      select m.lot_id, (-sum(m.minutes))::integer as minutes
        from public.credit_ledger m
       where m.booking_id = v_booking.id
         and m.kind = 'fee'
       group by m.lot_id
      having -sum(m.minutes) > 0
       order by m.lot_id
    loop
      insert into public.credit_ledger (business_id, learner_id, lot_id, kind, minutes, booking_id, actor_id, reason)
      values (v_booking.business_id, v_booking.learner_id, v_fee_row.lot_id, 'adjustment', v_fee_row.minutes,
              v_booking.id, v_user, 'No-show fee waived after a dispute');
      v_credit_back := v_credit_back + v_fee_row.minutes;
    end loop;

    -- Money that paid it goes back the way it came; with the fee gone, nothing is kept.
    v_money := private.settle_cancelled_payments(v_booking.id, 0, v_user, 'No-show fee waived after a dispute');

    update public.bookings
       set fee_pence = 0,
           payment_status = case when v_credit_back > 0 then 'refunded'::public.booking_payment_status else payment_status end,
           version = version + 1
     where id = v_booking.id;
  end if;

  update public.no_show_disputes
     set decided_at = now(), decided_by = v_user, outcome = p_outcome::public.no_show_dispute_outcome, note = v_note
   where id = p_dispute_id;

  perform private.write_audit('no_show.dispute_decided', 'booking', v_booking.id, v_booking.business_id,
    jsonb_build_object('fee_pence', v_booking.fee_pence),
    jsonb_build_object('dispute_id', p_dispute_id, 'outcome', p_outcome, 'credit_returned_minutes', v_credit_back)
      || v_money);
  perform private.enqueue_event('booking.dispute_decided',
    jsonb_build_object('booking_id', v_booking.id, 'dispute_id', p_dispute_id, 'outcome', p_outcome,
                       'fee_pence', v_booking.fee_pence, 'credit_returned_minutes', v_credit_back)
      || v_money);

  return jsonb_build_object('outcome', p_outcome, 'fee_pence', v_booking.fee_pence, 'credit_returned_minutes', v_credit_back)
         || v_money;
end;
$$;

revoke all on function public.dispute_no_show(uuid, text) from public, anon;
revoke all on function public.decide_no_show_dispute(uuid, text, text) from public, anon;
grant execute on function public.dispute_no_show(uuid, text) to authenticated;
grant execute on function public.decide_no_show_dispute(uuid, text, text) to authenticated;
