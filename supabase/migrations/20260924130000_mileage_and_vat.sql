-- Business miles, and whether a Business charges VAT (MNY-03, MNY-02, D-198).
--
-- Miles are tenths of a mile held as whole numbers, for the same reason money is held in pence.
-- No rate is stored against a trip: 45p a mile applies to the first ten thousand miles of a tax
-- year and 25p after that, so which band a mile falls in depends on the miles before it, and the
-- claim is worked out over the year as a whole.

create table public.mileage_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  /** The day it was driven, which is the day it counts for. */
  travelled_on date not null,
  miles_tenths integer not null check (miles_tenths > 0 and miles_tenths <= 1000000),
  /** The lesson it was for, when it was for one (MNY-03). */
  booking_id uuid references public.bookings (id) on delete set null,
  note text check (note is null or char_length(trim(note)) between 1 and 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.mileage_log enable row level security;

create index mileage_log_business_day_idx on public.mileage_log (business_id, travelled_on desc);
create index mileage_log_booking_idx on public.mileage_log (booking_id) where booking_id is not null;

grant select on public.mileage_log to authenticated;

create policy mileage_log_read_own on public.mileage_log
  for select to authenticated
  using (private.auth_keeps_books(business_id));

-- ---------------------------------------------------------------------------------------
-- record_mileage: a trip, against the car that made it.
-- ---------------------------------------------------------------------------------------
create or replace function public.record_mileage(
  p_business_id uuid,
  p_vehicle_id uuid,
  p_travelled_on date,
  p_miles_tenths integer,
  p_booking_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_method public.claim_method;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_keeps_books(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_travelled_on is null or p_travelled_on > (now() at time zone 'Europe/London')::date then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "travelled_on"}';
  end if;
  if p_miles_tenths is null or p_miles_tenths <= 0 or p_miles_tenths > 1000000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "miles"}';
  end if;

  select claim_method into v_method from public.vehicles
   where id = p_vehicle_id and business_id = p_business_id
     for update;
  if not found then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "vehicle_id"}';
  end if;

  -- A car claimed on what it actually costs is not also claimed by the mile.
  if v_method = 'actual_costs' then
    raise exception 'CLAIMED_ON_COSTS' using detail = '{"field": "vehicle_id"}';
  end if;
  -- The first claim decides, as it does for an expense.
  if v_method is null then
    update public.vehicles
       set claim_method = 'mileage', method_settled_at = now(), updated_at = now()
     where id = p_vehicle_id;
    perform private.write_audit('vehicle.method_set', 'vehicle', p_vehicle_id, p_business_id, null,
      jsonb_build_object('method', 'mileage', 'settled_by', 'mileage'));
  end if;

  -- A lesson has its miles recorded once. Recording them again replaces the first.
  if p_booking_id is not null then
    delete from public.mileage_log where booking_id = p_booking_id and business_id = p_business_id;
  end if;

  insert into public.mileage_log (business_id, vehicle_id, travelled_on, miles_tenths, booking_id, note, created_by)
  values (p_business_id, p_vehicle_id, p_travelled_on, p_miles_tenths, p_booking_id,
          nullif(trim(coalesce(p_note, '')), ''), v_user)
  returning id into v_id;

  perform private.write_audit('mileage.recorded', 'mileage', v_id, p_business_id, null,
    jsonb_build_object('miles_tenths', p_miles_tenths, 'travelled_on', p_travelled_on));
  return v_id;
end;
$$;

revoke all on function public.record_mileage(uuid, uuid, date, integer, uuid, text) from public, anon;
grant execute on function public.record_mileage(uuid, uuid, date, integer, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- remove_mileage: a trip taken back out.
-- ---------------------------------------------------------------------------------------
create or replace function public.remove_mileage(p_mileage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.mileage_log;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_row from public.mileage_log where id = p_mileage_id for update;
  if v_row.id is null or not private.auth_keeps_books(v_row.business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  delete from public.mileage_log where id = p_mileage_id;
  perform private.write_audit('mileage.removed', 'mileage', p_mileage_id, v_row.business_id,
    jsonb_build_object('miles_tenths', v_row.miles_tenths), null);
end;
$$;

revoke all on function public.remove_mileage(uuid) from public, anon;
grant execute on function public.remove_mileage(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- Whether a Business is registered for VAT (MNY-02).
--
-- The number was already here, for receipts (PAY-08). What was missing is the answer to the
-- question itself: an empty number could mean "not registered" or "has not filled it in yet",
-- and the books need to know which.
-- ---------------------------------------------------------------------------------------
alter table public.businesses
  add column vat_registered boolean not null default false,
  add column vat_registered_from date;

-- A column is private until it is granted, and these two are nobody's secret (D-123).
grant select (vat_registered, vat_registered_from) on public.businesses to authenticated;

create or replace function public.set_vat_registration(
  p_business_id uuid,
  p_registered boolean,
  p_number text default null,
  p_from date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text := upper(regexp_replace(coalesce(p_number, ''), '[^A-Za-z0-9]', '', 'g'));
  v_before jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_registered is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "registered"}';
  end if;
  -- A UK VAT number is nine digits, or twelve for a branch. GB in front of it is optional.
  if p_registered then
    v_number := regexp_replace(v_number, '^GB', '');
    if v_number !~ '^[0-9]{9}([0-9]{3})?$' then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "vat_number"}';
    end if;
  else
    v_number := null;
  end if;

  select jsonb_build_object('registered', vat_registered, 'number', vat_number)
    into v_before
    from public.businesses where id = p_business_id for update;

  update public.businesses
     set vat_registered = p_registered,
         vat_number = v_number,
         vat_registered_from = case when p_registered then p_from else null end,
         updated_at = now()
   where id = p_business_id;

  perform private.write_audit('business.vat_set', 'business', p_business_id, p_business_id, v_before,
    jsonb_build_object('registered', p_registered, 'number', v_number));

  return jsonb_build_object('registered', p_registered, 'number', v_number);
end;
$$;

revoke all on function public.set_vat_registration(uuid, boolean, text, date) from public, anon;
grant execute on function public.set_vat_registration(uuid, boolean, text, date) to authenticated;
