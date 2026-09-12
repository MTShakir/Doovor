-- One-off open slots and time off (DIA-02, M1-17).
--
-- Two people describing the same week should end up with the same diary, so overlapping
-- entries are resolved when they are written rather than argued about when they are read:
--
--   same kind    two blocks of time off that touch or overlap become one block;
--   other kind   the newer instruction wins, and the older period is trimmed around it,
--                which can leave it split in two.
--
-- The result is that no instant is ever both open and blocked, and the list stays short.

create or replace function public.set_availability_exception(
  p_instructor_id uuid,
  p_kind public.exception_kind,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
  v_other public.exception_kind :=
    case when p_kind = 'open' then 'blocked'::public.exception_kind else 'open'::public.exception_kind end;
  v_starts timestamptz := p_starts_at;
  v_ends timestamptz := p_ends_at;
  v_row record;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
     and not private.auth_has_permission(v_business, 'manage_availability') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "endsAt"}';
  end if;

  -- Same kind: swallow anything that touches or overlaps, and widen to cover the lot.
  for v_row in
    delete from public.availability_exceptions
     where instructor_id = p_instructor_id
       and kind = p_kind
       -- Touching counts as overlapping here: two blocks that meet are one block.
       and (period && tstzrange(v_starts, v_ends, '[)') or period -|- tstzrange(v_starts, v_ends, '[)'))
    returning starts_at, ends_at
  loop
    v_starts := least(v_starts, v_row.starts_at);
    v_ends := greatest(v_ends, v_row.ends_at);
  end loop;

  -- Other kind: the newer instruction wins, so trim what was there around it.
  for v_row in
    select id, starts_at, ends_at, kind, reason, created_by
      from public.availability_exceptions
     where instructor_id = p_instructor_id
       and kind = v_other
       and period && tstzrange(v_starts, v_ends, '()')
  loop
    if v_row.starts_at >= v_starts and v_row.ends_at <= v_ends then
      delete from public.availability_exceptions where id = v_row.id;
    elsif v_row.starts_at < v_starts and v_row.ends_at > v_ends then
      -- Spans the new period: keep the left part, add the right one back.
      update public.availability_exceptions set ends_at = v_starts where id = v_row.id;
      insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason, created_by)
      values (p_instructor_id, v_business, v_row.kind, v_ends, v_row.ends_at, v_row.reason, v_row.created_by);
    elsif v_row.starts_at < v_starts then
      update public.availability_exceptions set ends_at = v_starts where id = v_row.id;
    else
      update public.availability_exceptions set starts_at = v_ends where id = v_row.id;
    end if;
  end loop;

  insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason, created_by)
  values (p_instructor_id, v_business, p_kind, v_starts, v_ends, nullif(btrim(coalesce(p_reason, '')), ''), (select auth.uid()))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.set_availability_exception(uuid, public.exception_kind, timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.set_availability_exception(uuid, public.exception_kind, timestamptz, timestamptz, text)
  to authenticated;
