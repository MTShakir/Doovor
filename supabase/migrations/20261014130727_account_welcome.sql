-- A welcome, once somebody's email is confirmed (NTF-03, NTF-06, D-259).
--
-- The moment Supabase Auth marks an email confirmed is the moment the account is really theirs, so
-- that is when they are welcomed: by the link in the confirmation email, by the first sign-in link
-- to an address nobody had confirmed, or by signing up with Google or Apple, which confirm the
-- address themselves. An account made by hand for a learner (D-068) or by a seed is not welcomed
-- for being made; its owner is, when they first confirm it.
--
-- The triggers only queue the event, as every write here does (D-017). A job reads what to say
-- through system_welcome_notice and writes the notification, which the dispatcher emails.

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := v_meta ->> 'intended_role';
begin
  insert into public.users (id, email, email_verified_at, phone, phone_verified_at, full_name, avatar_url, intended_role)
  values (
    new.id,
    new.email,
    new.email_confirmed_at,
    new.phone,
    new.phone_confirmed_at,
    left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), nullif(trim(v_meta ->> 'name'), ''), ''), 120),
    coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    case when v_role in ('learner', 'instructor', 'school') then v_role::public.intended_role end
  );

  -- Signed up with Google or Apple: the address arrives confirmed, and they are as new as anybody
  -- who clicked a link. An account made with its email already confirmed is a seed or staff.
  if new.email_confirmed_at is not null
     and coalesce(new.raw_app_meta_data ->> 'provider', 'email') not in ('email', 'phone') then
    perform private.enqueue_event('account/email-confirmed', jsonb_build_object('user_id', new.id));
  end if;
  return new;
end;
$$;

create or replace function private.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
     set email = new.email,
         email_verified_at = new.email_confirmed_at,
         phone = new.phone,
         phone_verified_at = new.phone_confirmed_at
   where id = new.id;

  -- Confirmed for the first time. A changed address is confirmed again later, and is not new.
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform private.enqueue_event('account/email-confirmed', jsonb_build_object('user_id', new.id));
  end if;
  return new;
end;
$$;

/**
 * Who to welcome, and as whom: the name they gave and the side they signed up for. A person
 * invited to a Business without choosing one is a learner, which is what an invitation makes them.
 * Null for an account that is gone, or whose email is not confirmed after all.
 */
create or replace function public.system_welcome_notice(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'user_id', u.id,
           'full_name', u.full_name,
           'audience', coalesce(u.intended_role::text, 'learner')
         )
    from public.users u
   where u.id = p_user_id
     and u.email_verified_at is not null;
$$;

revoke all on function public.system_welcome_notice(uuid) from public, anon, authenticated;
grant execute on function public.system_welcome_notice(uuid) to service_role;
