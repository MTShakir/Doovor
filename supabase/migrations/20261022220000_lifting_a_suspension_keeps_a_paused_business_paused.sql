-- Lifting a suspension puts a paused Business back to paused (ADM-02, D-292, D-363).
--
-- A Business is paused while its owner teaches under a school, so that its link and profile take
-- nobody while the school's do (D-292, D-311). Suspended in that time and then let off, it came
-- back active, with its booking link open again beside the school's, though its owner was still
-- teaching there. It now comes back as it was before the suspension.

create or replace function public.admin_set_business_suspended(p_business_id uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business public.businesses;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff('super') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_suspended is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "suspended"}';
  end if;

  select * into v_business from public.businesses where id = p_business_id for update;
  if v_business.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  if p_suspended then
    if v_reason is null or char_length(v_reason) > 500 then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "reason"}';
    end if;
    if v_business.status = 'suspended' then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_suspended"}';
    end if;
    update public.businesses
       set status = 'suspended', suspended_at = now(), suspended_by = v_user, suspension_reason = v_reason, updated_at = now()
     where id = p_business_id;
    perform private.write_audit('business.suspended', 'business', p_business_id, p_business_id,
      jsonb_build_object('status', v_business.status),
      jsonb_build_object('status', 'suspended', 'reason', v_reason));
  else
    if v_business.status <> 'suspended' then
      raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_suspended"}';
    end if;
    -- A Business paused while its owner teaches under a school goes back to paused, which only its
    -- owner lifts, by leaving or reopening it (D-292, D-311, D-363).
    update public.businesses
       set status = case when v_business.paused_at is not null then 'paused' else 'active' end::public.business_status,
           suspended_at = null, suspended_by = null, suspension_reason = null, updated_at = now()
     where id = p_business_id;
    perform private.write_audit('business.reactivated', 'business', p_business_id, p_business_id,
      jsonb_build_object('status', 'suspended', 'reason', v_business.suspension_reason),
      jsonb_build_object('status', case when v_business.paused_at is not null then 'paused' else 'active' end));
  end if;
end;
$$;
