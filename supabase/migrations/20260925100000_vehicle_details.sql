-- What a car actually is, and putting one away (MNY-03, D-199).
--
-- A car was a name and nothing else, which is enough to keep costs against and not enough to put
-- on a return or to look anything up about later. It now carries its make, model, year and plate.
--
-- The name stays for the cars added before this, because that is what their owner called them, and
-- is no longer asked for: what a car is called is worked out from what it is (packages/core).
--
-- Nothing is deleted. A car with a claim against it is part of a financial record, so it is
-- retired instead: it stops being offered, and its history stays exactly where it was.

alter table public.vehicles
  alter column name drop not null,
  add column make text check (make is null or char_length(trim(make)) between 1 and 40),
  add column model text check (model is null or char_length(trim(model)) between 1 and 40),
  add column year integer check (year is null or year between 1950 and 2100),
  /** Capitals and digits only, as packages/core stores it: one plate typed three ways is one car. */
  add column registration text check (registration is null or registration ~ '^[A-Z0-9]{2,8}$');

-- A plate is one car. Retired ones are left out, so a car can be replaced by its own plate after
-- it has been sold and bought back, which happens.
create unique index vehicles_registration_idx
  on public.vehicles (business_id, registration)
  where registration is not null and retired_at is null;

-- ---------------------------------------------------------------------------------------
-- add_vehicle: the old one took a name. This one takes the car.
-- ---------------------------------------------------------------------------------------
drop function if exists public.add_vehicle(uuid, text);

create or replace function public.add_vehicle(
  p_business_id uuid,
  p_make text,
  p_model text default null,
  p_year integer default null,
  p_registration text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_make text := nullif(trim(coalesce(p_make, '')), '');
  v_model text := nullif(trim(coalesce(p_model, '')), '');
  v_plate text := nullif(upper(regexp_replace(coalesce(p_registration, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_keeps_books(p_business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_make is null or char_length(v_make) > 40 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "make"}';
  end if;
  if v_model is not null and char_length(v_model) > 40 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "model"}';
  end if;
  if p_year is not null and p_year not between 1950 and 2100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "year"}';
  end if;
  if v_plate is not null and v_plate !~ '^[A-Z0-9]{2,8}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "registration"}';
  end if;
  if v_plate is not null and exists (
    select 1 from public.vehicles
     where business_id = p_business_id and registration = v_plate and retired_at is null
  ) then
    raise exception 'DUPLICATE_VEHICLE' using detail = '{"field": "registration"}';
  end if;

  insert into public.vehicles (business_id, make, model, year, registration)
  values (p_business_id, v_make, v_model, p_year, v_plate)
  returning id into v_id;

  perform private.write_audit('vehicle.added', 'vehicle', v_id, p_business_id, null,
    jsonb_build_object('make', v_make, 'model', v_model, 'registration', v_plate));
  return v_id;
end;
$$;

revoke all on function public.add_vehicle(uuid, text, text, integer, text) from public, anon;
grant execute on function public.add_vehicle(uuid, text, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------------------
-- retire_vehicle: a car that is gone, without taking its history with it.
-- ---------------------------------------------------------------------------------------
create or replace function public.retire_vehicle(p_vehicle_id uuid)
returns void
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

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if v_vehicle.id is null or not private.auth_keeps_books(v_vehicle.business_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Retiring one twice is retiring it once.
  if v_vehicle.retired_at is not null then
    return;
  end if;

  update public.vehicles set retired_at = now(), updated_at = now() where id = p_vehicle_id;

  perform private.write_audit('vehicle.retired', 'vehicle', p_vehicle_id, v_vehicle.business_id, null,
    jsonb_build_object('registration', v_vehicle.registration));
end;
$$;

revoke all on function public.retire_vehicle(uuid) from public, anon;
grant execute on function public.retire_vehicle(uuid) to authenticated;

-- A column is private until it is granted, and none of these is a secret.
grant select (make, model, year, registration) on public.vehicles to authenticated;
