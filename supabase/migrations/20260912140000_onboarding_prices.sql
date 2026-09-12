-- Setting prices during onboarding (AUTH-04, R-05, PAY-04, M1-08).
--
-- The step asks two questions: what an hour costs, and what ten hours cost if they are sold
-- as a block. Three rows come out of that, and they have to arrive together: a lesson type
-- with no price, or a package pointing at nothing, is worse than neither. One function, one
-- transaction. Longer lessons start proportional to the hourly price and can be changed one
-- by one later (M1-11).

create or replace function public.set_onboarding_prices(
  p_business_id uuid,
  p_hourly_price_pence integer,
  p_package_price_pence integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_type uuid;
  v_minutes smallint;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'set_prices') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- £5 to £500 an hour. Wide enough for an introductory offer and for an intensive course.
  if p_hourly_price_pence is null or p_hourly_price_pence not between 500 and 50000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "hourlyPricePence"}';
  end if;
  if p_package_price_pence is not null and p_package_price_pence not between 500 and 500000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "packagePricePence"}';
  end if;

  select id into v_lesson_type
    from public.lesson_types
   where business_id = p_business_id and kind = 'standard'
   order by sort_order, created_at
   limit 1;

  if v_lesson_type is null then
    insert into public.lesson_types (business_id, kind, name, sort_order)
    values (p_business_id, 'standard', 'Standard lesson', 0)
    returning id into v_lesson_type;
  end if;

  -- R-05: price is per lesson type and duration. 60, 90 and 120 are the defaults.
  foreach v_minutes in array array[60, 90, 120]::smallint[] loop
    insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
    values (p_business_id, v_lesson_type, v_minutes, round(p_hourly_price_pence * v_minutes / 60.0))
    on conflict (lesson_type_id, instructor_id, duration_minutes)
    do update set price_pence = excluded.price_pence;
  end loop;

  if p_package_price_pence is not null then
    update public.packages
       set price_pence = p_package_price_pence, lesson_type_id = v_lesson_type, is_active = true
     where business_id = p_business_id and minutes = 600;
    if not found then
      insert into public.packages (business_id, name, minutes, price_pence, lesson_type_id, expiry_days)
      values (p_business_id, '10 hours', 600, p_package_price_pence, v_lesson_type, 365);
    end if;
  end if;

  perform private.write_audit(
    'business.prices_set', 'business', p_business_id, p_business_id, null,
    jsonb_build_object('hourly_price_pence', p_hourly_price_pence, 'package_price_pence', p_package_price_pence)
  );
  return v_lesson_type;
end;
$$;

revoke all on function public.set_onboarding_prices(uuid, integer, integer) from public, anon;
grant execute on function public.set_onboarding_prices(uuid, integer, integer) to authenticated;
