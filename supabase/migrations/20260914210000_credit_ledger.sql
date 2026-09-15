-- Lesson credit: the accounts, the lots and the ledger (PAY-04, PAY-06, PAY-12, R-07, R-10, M3-12).
--
-- Credit is time a learner has bought from one Business, never money the platform holds
-- (PAY-12). Three tables keep it (ARCHITECTURE 8.3):
--
--   credit_accounts  one per Business and learner: the balance, kept for reading and for
--                    locking while it changes. It can never go below nothing.
--   credit_lots      one per package bought, or credit given: how many minutes, for how much,
--                    until when, and how many are left. Lessons use the oldest lots first, and a
--                    refund values each lot at the price it was bought for.
--   credit_ledger    every change to a lot, append-only.
--
-- The ledger is the truth and the other two follow it. A ledger row moves its lot and its
-- account by trigger, in the statement that writes it, and nothing else may change either
-- number, so a balance is always the sum of its ledger and a lot the sum of its own rows. A move
-- that would take a lot or a balance below nothing, or a lot past what was bought, fails a check
-- and takes the whole transaction with it (R-10).
--
-- Which moves to make is decided by the rules in packages/core/src/credit.ts. The functions that
-- make them arrive with what needs them: buying a package (M3-13), and booking and cancelling
-- with credit (M3-14). Nothing here is deleted, and neither is the Business, learner, lesson or
-- payment a move points at: financial records are kept for six years (NFR-PRV-03).

create type public.credit_entry_kind as enum ('purchase', 'use', 'return', 'fee', 'expiry', 'adjustment', 'refund');

/** A learner's credit with one Business (PAY-04, PAY-06). */
create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  learner_id uuid not null,
  /** The sum of the ledger, kept here to be read and locked (ARCHITECTURE 7.6). */
  balance_minutes integer not null default 0 check (balance_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, learner_id),
  -- Credit with a Business is held only by one of its learners (PAY-12).
  foreign key (business_id, learner_id) references public.learner_relationships (business_id, learner_id)
);

/** One package bought, or credit given: the unit credit is used, expired and refunded in. */
create table public.credit_lots (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  learner_id uuid not null,
  /** The package it was sold as. The lot keeps its own terms if the package changes later. */
  package_id uuid references public.packages (id) on delete set null,
  /** What paid for it. One lot per payment, however many times the webhook says so (R-11). */
  payment_id uuid unique references public.payments (id),
  minutes_total integer not null check (minutes_total > 0),
  /** What is left: the sum of this lot's ledger rows. It starts empty and its first row fills it. */
  minutes_remaining integer not null default 0,
  price_pence integer not null check (price_pence >= 0),
  purchased_at timestamptz not null default now(),
  /** When what is left stops being usable. Null for credit that never runs out. */
  expires_at timestamptz,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  check (minutes_remaining between 0 and minutes_total),
  check (expires_at is null or expires_at > purchased_at),
  unique (id, business_id, learner_id),
  foreign key (business_id, learner_id) references public.credit_accounts (business_id, learner_id)
);

create index credit_lots_account_idx on public.credit_lots (business_id, learner_id, purchased_at);

/** Every change to a lot, in the order it happened. Rows are added, never changed. */
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  learner_id uuid not null,
  lot_id uuid not null,
  kind public.credit_entry_kind not null,
  /** What the move does to the lot, signed: negative when minutes leave the balance. */
  minutes integer not null,
  /** The lesson that used the minutes, gave them back or kept them as a fee. */
  booking_id uuid references public.bookings (id),
  /** The payment behind a purchase. */
  payment_id uuid references public.payments (id),
  /** The refund that paid unused minutes back (PAY-07). */
  refund_id uuid references public.refunds (id),
  /** Who made the move. Null when nobody did: a webhook or a sweep. */
  actor_id uuid references public.users (id),
  reason text check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  -- The lot belongs to the same learner and Business as the move, so credit bought from one
  -- Business can never be spent with another (PAY-12).
  foreign key (lot_id, business_id, learner_id) references public.credit_lots (id, business_id, learner_id),
  -- Minutes arrive by being bought, given back or given, and leave every other way.
  constraint credit_ledger_direction check (
    case kind
      when 'purchase' then minutes > 0
      when 'return' then minutes > 0
      when 'adjustment' then minutes <> 0
      else minutes < 0
    end
  ),
  -- Using minutes, giving them back and keeping a fee are always about one lesson (R-07).
  constraint credit_ledger_lesson check (kind not in ('use', 'return', 'fee') or booking_id is not null),
  constraint credit_ledger_purchase check (kind <> 'purchase' or payment_id is not null),
  constraint credit_ledger_refund check (kind <> 'refund' or refund_id is not null),
  -- Credit given or taken away by hand says who did it and why (PAY-07).
  constraint credit_ledger_adjustment check (kind <> 'adjustment' or (actor_id is not null and reason is not null))
);

create index credit_ledger_account_idx on public.credit_ledger (business_id, learner_id, created_at desc);
create index credit_ledger_lot_idx on public.credit_ledger (lot_id);
create index credit_ledger_booking_idx on public.credit_ledger (booking_id) where booking_id is not null;

-- A lot is bought once.
create unique index credit_ledger_one_purchase on public.credit_ledger (lot_id) where kind = 'purchase';

-- ---------------------------------------------------------------------------------------
-- The ledger moves the lot and the balance, and nothing else does.
-- ---------------------------------------------------------------------------------------

/**
 * Applies a ledger row to its account and its lot (M3-12).
 *
 * The account is changed first, so every move on one learner's credit with a Business takes the
 * same lock first and concurrent moves queue rather than deadlock. The checks on both tables
 * refuse a move that takes either below nothing, or a lot past what was bought. The setting is
 * how the guards below know a change comes from here; it lasts only as long as the two updates.
 */
create or replace function private.apply_credit_move()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lot public.credit_lots;
begin
  perform set_config('app.credit_move', 'on', true);

  update public.credit_accounts
     set balance_minutes = balance_minutes + new.minutes
   where business_id = new.business_id
     and learner_id = new.learner_id;

  update public.credit_lots
     set minutes_remaining = minutes_remaining + new.minutes
   where id = new.lot_id
  returning * into v_lot;

  perform set_config('app.credit_move', '', true);

  -- A purchase is the whole lot, into a lot nothing has touched, for the payment that bought it.
  if new.kind = 'purchase'
     and (new.minutes <> v_lot.minutes_total
          or v_lot.minutes_remaining <> v_lot.minutes_total
          or new.payment_id is distinct from v_lot.payment_id) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "minutes"}';
  end if;

  return null;
end;
$$;

revoke all on function private.apply_credit_move() from public, anon, authenticated;

create trigger credit_ledger_apply
  after insert on public.credit_ledger
  for each row execute function private.apply_credit_move();

/** A lot keeps what it was bought as, and what is left in it changes only by a ledger row. */
create or replace function private.guard_credit_lot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.minutes_remaining <> 0 then
      raise exception 'a credit lot starts empty and is filled by credit_ledger' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if (new.id, new.business_id, new.learner_id, new.payment_id, new.minutes_total, new.price_pence, new.purchased_at)
     is distinct from
     (old.id, old.business_id, old.learner_id, old.payment_id, old.minutes_total, old.price_pence, old.purchased_at) then
    raise exception 'what a credit lot was bought as cannot change' using errcode = 'insufficient_privilege';
  end if;

  if new.minutes_remaining <> old.minutes_remaining
     and current_setting('app.credit_move', true) is distinct from 'on' then
    raise exception 'credit lots change only through credit_ledger' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_credit_lot() from public, anon, authenticated;

create trigger credit_lots_guard
  before insert or update on public.credit_lots
  for each row execute function private.guard_credit_lot();

/** An account belongs to one learner at one Business, and its balance changes only by a ledger row. */
create or replace function private.guard_credit_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.balance_minutes <> 0 then
      raise exception 'a credit account starts empty and is filled by credit_ledger' using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if (new.id, new.business_id, new.learner_id) is distinct from (old.id, old.business_id, old.learner_id) then
    raise exception 'a credit account cannot change hands' using errcode = 'insufficient_privilege';
  end if;

  if new.balance_minutes <> old.balance_minutes
     and current_setting('app.credit_move', true) is distinct from 'on' then
    raise exception 'credit balances change only through credit_ledger' using errcode = 'insufficient_privilege';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.guard_credit_account() from public, anon, authenticated;

create trigger credit_accounts_guard
  before insert or update on public.credit_accounts
  for each row execute function private.guard_credit_account();

/** The ledger is history: rows are added and never changed, deleted or truncated. */
create or replace function private.prevent_credit_ledger_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'credit_ledger is append-only' using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function private.prevent_credit_ledger_changes() from public, anon, authenticated;

create trigger credit_ledger_append_only
  before update or delete on public.credit_ledger
  for each row execute function private.prevent_credit_ledger_changes();

create trigger credit_ledger_no_truncate
  before truncate on public.credit_ledger
  for each statement execute function private.prevent_credit_ledger_changes();

-- ---------------------------------------------------------------------------------------
-- Who sees credit: the people who see the learner card (PAY-06, LRN-02). The learner; the
-- owners and managers of the Business; the instructor who teaches the learner, and in a school
-- no other; and platform staff. Nobody writes to any of it directly.
-- ---------------------------------------------------------------------------------------

/** The learners the signed in instructor teaches, with the Business they teach them for. */
create or replace function private.auth_instructor_learners()
returns table (business_id uuid, learner_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select lr.business_id, lr.learner_id
    from public.learner_relationships lr
   where lr.instructor_id in (select private.auth_instructor_ids());
$$;

revoke all on function private.auth_instructor_learners() from public, anon;
grant execute on function private.auth_instructor_learners() to authenticated;

alter table public.credit_accounts enable row level security;
alter table public.credit_lots enable row level security;
alter table public.credit_ledger enable row level security;

create policy credit_accounts_select on public.credit_accounts
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or (business_id, learner_id) in (select * from private.auth_instructor_learners())
    or (select private.auth_is_staff())
  );

create policy credit_lots_select on public.credit_lots
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or (business_id, learner_id) in (select * from private.auth_instructor_learners())
    or (select private.auth_is_staff())
  );

create policy credit_ledger_select on public.credit_ledger
  for select to authenticated
  using (
    learner_id = (select auth.uid())
    or business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or (business_id, learner_id) in (select * from private.auth_instructor_learners())
    or (select private.auth_is_staff())
  );

revoke all on public.credit_accounts, public.credit_lots, public.credit_ledger from authenticated, anon;
grant select on public.credit_accounts, public.credit_lots, public.credit_ledger to authenticated;
