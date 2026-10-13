-- A car with dual controls is claimed on what it costs, never by the mile (MNY-03, D-256).
--
-- HMRC's flat rate for business miles is not for a car built for the work, and GOV.UK names a
-- driving instructor's dual control car as one. Such a car is claimed on its actual costs, so the
-- question is asked when the car is added, and the answer settles how it is claimed there and then.
--
-- The answer is kept as well as the method it settles, so the books can say why a car cannot have
-- its miles claimed, and the table itself refuses a dual control car claimed by the mile.

alter table public.vehicles
  add column dual_controls boolean not null default false,
  add constraint vehicles_dual_controls_on_costs
    check (not dual_controls or claim_method is not distinct from 'actual_costs');

-- ---------------------------------------------------------------------------------------
-- add_vehicle: the car, and whether it has dual controls.
-- ---------------------------------------------------------------------------------------
drop function if exists public.add_vehicle(uuid, text, text, integer, text);

create or replace function public.add_vehicle(
  p_business_id uuid,
  p_make text,
  p_model text default null,
  p_year integer default null,
  p_registration text default null,
  p_dual_controls boolean default false
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
  v_dual boolean := coalesce(p_dual_controls, false);
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

  -- A car with dual controls has only one way to be claimed, so it is settled as it arrives.
  -- One without is left for its first claim to settle, as before.
  insert into public.vehicles (business_id, make, model, year, registration, dual_controls, claim_method, method_settled_at)
  values (
    p_business_id, v_make, v_model, p_year, v_plate, v_dual,
    case when v_dual then 'actual_costs'::public.claim_method end,
    case when v_dual then now() end
  )
  returning id into v_id;

  perform private.write_audit('vehicle.added', 'vehicle', v_id, p_business_id, null,
    jsonb_build_object('make', v_make, 'model', v_model, 'registration', v_plate, 'dual_controls', v_dual));
  if v_dual then
    perform private.write_audit('vehicle.method_set', 'vehicle', v_id, p_business_id, null,
      jsonb_build_object('method', 'actual_costs', 'because', 'dual_controls'));
  end if;
  return v_id;
end;
$$;

revoke all on function public.add_vehicle(uuid, text, text, integer, text, boolean) from public, anon;
grant execute on function public.add_vehicle(uuid, text, text, integer, text, boolean) to authenticated;

grant select (dual_controls) on public.vehicles to authenticated;
