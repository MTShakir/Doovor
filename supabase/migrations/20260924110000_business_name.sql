-- An instructor's trading name, which is not their own name (INS-01, D-196).
--
-- Signing up makes a Business named after the person, because that is all we know at the time.
-- Most instructors trade under something else ("Perfect Driving"), and that is the name learners
-- see on the public profile and on every receipt. Until now there was no way to change it.
--
-- The slug is deliberately left alone: it is the booking link an instructor has already given out,
-- and renaming a business is not a reason to break it.
create or replace function public.set_business_name(p_business_id uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := trim(coalesce(p_name, ''));
  v_before text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "name"}';
  end if;
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select name into v_before from public.businesses where id = p_business_id for update;
  if v_before is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  update public.businesses set name = v_name, updated_at = now() where id = p_business_id;

  if v_before is distinct from v_name then
    perform private.write_audit('business.renamed', 'business', p_business_id, p_business_id,
      jsonb_build_object('name', v_before), jsonb_build_object('name', v_name));
  end if;

  return v_name;
end;
$$;

revoke all on function public.set_business_name(uuid, text) from public, anon;
grant execute on function public.set_business_name(uuid, text) to authenticated;
