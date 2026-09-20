-- Who has asked to leave, for staff to read and answer (AUTH-09, ADM-02, D-175).
--
-- A deletion request waits seven days before the account is erased (D-149). The product owner
-- asked for a screen where staff see who asked, why, and how to reach them, so they can put right
-- whatever went wrong, and call the request off if the person decides to stay.
--
-- Reading the list is for any platform staff. Calling a request off changes somebody's account, so
-- it is for a super admin, as suspending a Business is (ADM-02); the person themselves can still
-- call it off from their own account.

create or replace function public.admin_deletion_requests(p_settled boolean default false)
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  phone text,
  intended_role text,
  business_name text,
  reason text,
  status text,
  requested_at timestamptz,
  erases_at timestamptz,
  processed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return query
    select d.id,
           d.user_id,
           u.full_name,
           u.email,
           u.phone,
           u.intended_role::text,
           (
             select b.name
               from public.memberships m
               join public.businesses b on b.id = m.business_id
              where m.user_id = d.user_id
              order by m.created_at
              limit 1
           ) as business_name,
           d.reason,
           d.status,
           d.requested_at,
           -- Seven days from the asking, which is when the job erases it (D-149).
           d.requested_at + interval '7 days' as erases_at,
           d.processed_at
      from public.deletion_requests d
      join public.users u on u.id = d.user_id
     where (p_settled or d.status in ('pending', 'processing'))
     order by d.requested_at, d.id
     limit 200;
end;
$$;

comment on function public.admin_deletion_requests(boolean) is
  'Who has asked to leave, why, and how to reach them, for platform staff (AUTH-09, D-175).';

revoke all on function public.admin_deletion_requests(boolean) from public, anon;
grant execute on function public.admin_deletion_requests(boolean) to authenticated;

/** A super admin calls off somebody's deletion request, with a note saying why (AUTH-09, D-175). */
create or replace function public.admin_cancel_deletion_request(p_request_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_request public.deletion_requests;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.platform_staff s where s.user_id = v_user and s.role = 'super_admin') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_note is null or char_length(v_note) > 500 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "note"}';
  end if;

  update public.deletion_requests
     set status = 'cancelled', updated_at = now()
   where id = p_request_id
     and status = 'pending'
  returning * into v_request;

  if v_request.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.write_audit(
    'account.deletion_cancelled',
    'user',
    v_request.user_id,
    null,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'cancelled', 'by', 'staff', 'note', v_note, 'request_id', v_request.id)
  );
end;
$$;

revoke all on function public.admin_cancel_deletion_request(uuid, text) from public, anon;
grant execute on function public.admin_cancel_deletion_request(uuid, text) to authenticated;
