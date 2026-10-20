-- The owner of a school invites managers (M9-26, D-293).
--
-- A manager helps run the school: by default they manage its instructors, bookings, prices,
-- availability and learners, and refund, but see its revenue only when the owner allows it, as
-- before (D-120). Only the owner invites a manager; an owner or a manager invites instructors.

create or replace function public.invite_member(
  p_business_id uuid,
  p_role public.membership_role,
  p_channel text,
  p_full_name text default null,
  p_email text default null,
  p_phone text default null
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(p_business_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- A school has one owner, who signed it up, and nobody is invited to own it. Its owner invites
  -- managers, who do what a manager may and what the owner allows besides (SCH-02, D-293).
  if p_role is null or p_role not in ('instructor', 'manager') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "role"}';
  end if;
  if p_role = 'manager' and not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_channel not in ('email', 'sms', 'whatsapp', 'link') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "channel"}';
  end if;

  -- The same allowance as inviting learners: enough for a busy day, not for a script.
  if not private.rate_limit_hit('invite:' || v_user::text, interval '1 hour', 30) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  -- 32 random bytes, in the alphabet a link can carry without escaping.
  v_token := translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');

  insert into public.invitations (business_id, kind, role, channel, email, phone, full_name, token_hash, invited_by)
  values (
    p_business_id, 'member', p_role, p_channel,
    nullif(btrim(lower(coalesce(p_email, ''))), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_full_name, '')), ''),
    private.invitation_hash(v_token),
    v_user
  )
  returning id, invitations.expires_at into v_id, v_expires;

  perform private.write_audit('member.invited', 'invitation', v_id, p_business_id, null,
    jsonb_build_object('role', p_role, 'channel', p_channel));

  -- The only time the token exists outside the link.
  return query select v_id, v_token, v_expires;
end;
$$;
