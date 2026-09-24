-- An instructor's books: what they spent, and what they drove (MNY-02, MNY-03, D-198).
--
-- Solo instructors only for now, which is checked here and not only on screen: a school's books
-- involve commission and franchise settlement that MNY-06 has not specified yet, and "coming soon"
-- that a request could walk around would not be true.
--
-- Money is integer pence, as everywhere. Dates are the day money moved, because the books are kept
-- on the cash basis, and a day is a date rather than an instant: an expense belongs to the day its
-- owner says it does, wherever they were standing.

create type public.expense_category as enum (
  'fuel',
  'vehicle_finance',
  'vehicle_insurance',
  'servicing',
  'franchise_fee',
  'adi_registration',
  'training',
  'phone',
  'advertising',
  'accountancy',
  'bank_charges',
  'other'
);

-- How a vehicle's cost is claimed. The two cannot be mixed for one vehicle, ever, which is the
-- whole point of the mileage rate (MNY-03).
create type public.claim_method as enum ('mileage', 'actual_costs');

-- ---------------------------------------------------------------------------------------
-- Who keeps books: the owner of a business that is their own.
-- ---------------------------------------------------------------------------------------
create or replace function private.auth_keeps_books(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.auth_has_role(p_business_id, array['owner']::public.membership_role[])
     and exists (
       select 1 from public.businesses b
        where b.id = p_business_id and b.type = 'independent'
     );
$$;

revoke all on function private.auth_keeps_books(uuid) from public, anon;
-- The policies below are evaluated as the person asking, so they have to be able to call it.
grant execute on function private.auth_keeps_books(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- vehicles: the cars an instructor teaches in, and how each one is claimed.
-- ---------------------------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  /** What the instructor calls it: a registration, or "the Corsa". */
  name text not null check (char_length(trim(name)) between 1 and 60),
  /** Null until the first claim is made against it, and then it cannot change. */
  claim_method public.claim_method,
  /** When the method was settled, which is the moment it stopped being a choice. */
  method_settled_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((claim_method is null) = (method_settled_at is null))
);

alter table public.vehicles enable row level security;

create index vehicles_business_idx on public.vehicles (business_id) where retired_at is null;

-- The owner reads their own vehicles. Nobody writes directly: the RPCs below settle the method.
-- Read only. Every write goes through the functions below, which settle the method and audit.
grant select on public.vehicles to authenticated;

create policy vehicles_read_own on public.vehicles
  for select to authenticated
  using (private.auth_keeps_books(business_id));

-- ---------------------------------------------------------------------------------------
-- expenses: what went out, on the day it went out.
-- ---------------------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category public.expense_category not null,
  /** The day the money left, which is what the cash basis counts. */
  spent_on date not null,
  amount_pence integer not null check (amount_pence > 0 and amount_pence <= 100000000),
  /** The VAT inside that amount, for a Business that is registered. Zero for one that is not. */
  vat_pence integer not null default 0 check (vat_pence >= 0),
  note text check (note is null or char_length(trim(note)) between 1 and 500),
  /** The photographed receipt in the private bucket, as "<business id>/<file>". */
  receipt_path text check (receipt_path is null or char_length(receipt_path) between 1 and 200),
  /** Set for a cost of running one particular car, so the mileage rule can be applied. */
  vehicle_id uuid references public.vehicles (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_vat_within_amount check (vat_pence <= amount_pence)
);

alter table public.expenses enable row level security;

create index expenses_business_day_idx on public.expenses (business_id, spent_on desc);

grant select on public.expenses to authenticated;

create policy expenses_read_own on public.expenses
  for select to authenticated
  using (private.auth_keeps_books(business_id));

-- ---------------------------------------------------------------------------------------
-- The receipts themselves. Private, and foldered by Business so a policy can be written about it.
-- ---------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy receipts_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and private.auth_keeps_books(((storage.foldername(name))[1])::uuid)
  );

create policy receipts_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and private.auth_keeps_books(((storage.foldername(name))[1])::uuid)
  );

create policy receipts_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and private.auth_keeps_books(((storage.foldername(name))[1])::uuid)
  );

create policy receipts_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'receipts'
    and private.auth_keeps_books(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------------------
-- add_vehicle: a car to keep costs against.
-- ---------------------------------------------------------------------------------------
create or replace function public.add_vehicle(p_business_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "name"}';
  end if;
  if not private.auth_keeps_books(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  insert into public.vehicles (business_id, name) values (p_business_id, v_name) returning id into v_id;
  perform private.write_audit('vehicle.added', 'vehicle', v_id, p_business_id, null,
    jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

revoke all on function public.add_vehicle(uuid, text) from public, anon;
grant execute on function public.add_vehicle(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- set_vehicle_method: how this car is claimed, once and once only (MNY-03).
-- ---------------------------------------------------------------------------------------
create or replace function public.set_vehicle_method(p_vehicle_id uuid, p_method text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('mileage', 'actual_costs') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "method"}';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if v_vehicle.id is null or not private.auth_keeps_books(v_vehicle.business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- Settled once. HMRC lets a vehicle change method only when it is replaced, so a new car is a
  -- new row rather than an edit to this one.
  if v_vehicle.claim_method is not null then
    if v_vehicle.claim_method::text = p_method then
      return p_method;
    end if;
    raise exception 'METHOD_SETTLED' using detail = '{"field": "method"}';
  end if;

  update public.vehicles
     set claim_method = p_method::public.claim_method, method_settled_at = now(), updated_at = now()
   where id = p_vehicle_id;

  perform private.write_audit('vehicle.method_set', 'vehicle', p_vehicle_id, v_vehicle.business_id, null,
    jsonb_build_object('method', p_method));
  return p_method;
end;
$$;

revoke all on function public.set_vehicle_method(uuid, text) from public, anon;
grant execute on function public.set_vehicle_method(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- record_expense: what went out, on the day it went out.
-- ---------------------------------------------------------------------------------------
create or replace function public.record_expense(
  p_business_id uuid,
  p_category text,
  p_spent_on date,
  p_amount_pence integer,
  p_vat_pence integer default 0,
  p_note text default null,
  p_receipt_path text default null,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_method public.claim_method;
  v_running boolean;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_keeps_books(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_category is null or not exists (
    select 1 from unnest(enum_range(null::public.expense_category)) as known where known::text = p_category
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "category"}';
  end if;
  if p_spent_on is null or p_spent_on > (now() at time zone 'Europe/London')::date then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "spent_on"}';
  end if;
  if p_amount_pence is null or p_amount_pence <= 0 or p_amount_pence > 100000000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "amount_pence"}';
  end if;
  if coalesce(p_vat_pence, 0) < 0 or coalesce(p_vat_pence, 0) > p_amount_pence then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "vat_pence"}';
  end if;

  v_running := p_category in ('fuel', 'vehicle_finance', 'vehicle_insurance', 'servicing');

  if p_vehicle_id is not null then
    select claim_method into v_method from public.vehicles
     where id = p_vehicle_id and business_id = p_business_id;
    if not found then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "vehicle_id"}';
    end if;
    -- A car on the mileage rate has already been paid for by the mile. Claiming its running
    -- costs as well would count the same money twice (MNY-03).
    if v_running and v_method = 'mileage' then
      raise exception 'CLAIMED_BY_MILEAGE' using detail = '{"field": "category"}';
    end if;
  end if;

  insert into public.expenses (
    business_id, category, spent_on, amount_pence, vat_pence, note, receipt_path, vehicle_id, created_by
  ) values (
    p_business_id, p_category::public.expense_category, p_spent_on, p_amount_pence,
    coalesce(p_vat_pence, 0), nullif(trim(coalesce(p_note, '')), ''), p_receipt_path, p_vehicle_id, v_user
  ) returning id into v_id;

  perform private.write_audit('expense.recorded', 'expense', v_id, p_business_id, null,
    jsonb_build_object('category', p_category, 'amount_pence', p_amount_pence, 'spent_on', p_spent_on));
  return v_id;
end;
$$;

revoke all on function public.record_expense(uuid, text, date, integer, integer, text, text, uuid) from public, anon;
grant execute on function public.record_expense(uuid, text, date, integer, integer, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- remove_expense: a mistake taken back out of the books.
-- ---------------------------------------------------------------------------------------
create or replace function public.remove_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if v_expense.id is null or not private.auth_keeps_books(v_expense.business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  delete from public.expenses where id = p_expense_id;

  perform private.write_audit('expense.removed', 'expense', p_expense_id, v_expense.business_id,
    jsonb_build_object('category', v_expense.category, 'amount_pence', v_expense.amount_pence), null);
  -- The path is returned so the caller can take the picture out of storage as well.
  return jsonb_build_object('receipt_path', v_expense.receipt_path);
end;
$$;

revoke all on function public.remove_expense(uuid) from public, anon;
grant execute on function public.remove_expense(uuid) to authenticated;
