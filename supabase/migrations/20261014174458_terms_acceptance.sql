-- Agreeing to the terms and the privacy notice, on the record (NFR-PRV-02, PRD 15, D-265).
--
-- Signing up said "by creating an account you agree to our terms", with nothing to tick and nothing
-- written down. The product owner asked for it to be agreed to, and for that to be mandatory. Each
-- account now records which version it agreed to and when: the version is the day the newest of
-- the documents was last changed (packages/core/src/legal.ts), so a document that changes asks
-- everybody again.
--
-- Signing up with a password sends the version with the account, ticked on the form, and the
-- trigger below writes it down as the account is made. Everybody else, someone who signed up with
-- Google or Apple, someone added by an instructor, or an account from before this, agrees on a
-- screen of its own the first time they open the app, through accept_terms.

alter table public.users
  add column terms_version text check (terms_version is null or terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  add column terms_accepted_at timestamptz,
  add constraint users_terms_agreed_together check ((terms_version is null) = (terms_accepted_at is null));

comment on column public.users.terms_version is
  'The version of the terms and privacy notice agreed to: the day the newest of them last changed (D-265).';

-- ---------------------------------------------------------------------------------------
-- The trigger that makes the account's row: as before, and the version agreed to at sign-up.
-- ---------------------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := v_meta ->> 'intended_role';
  -- Ticked on the sign-up form and sent with the account. Anything that is not a version is
  -- treated as not agreed, which leaves them to agree on the screen of its own.
  v_terms text := case when (v_meta ->> 'terms_version') ~ '^\d{4}-\d{2}-\d{2}$' then v_meta ->> 'terms_version' end;
begin
  insert into public.users (
    id, email, email_verified_at, phone, phone_verified_at, full_name, avatar_url, intended_role, terms_version, terms_accepted_at
  )
  values (
    new.id,
    new.email,
    new.email_confirmed_at,
    new.phone,
    new.phone_confirmed_at,
    left(coalesce(nullif(trim(v_meta ->> 'full_name'), ''), nullif(trim(v_meta ->> 'name'), ''), ''), 120),
    coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    case when v_role in ('learner', 'instructor', 'school') then v_role::public.intended_role end,
    v_terms,
    case when v_terms is not null then now() end
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

-- ---------------------------------------------------------------------------------------
-- accept_terms: somebody agrees, on the screen that asks them.
-- ---------------------------------------------------------------------------------------
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_before text;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "version"}';
  end if;

  select terms_version into v_before from public.users where id = v_user;
  -- Agreeing again to the same version changes nothing and records nothing.
  if v_before is not distinct from p_version then
    return;
  end if;

  update public.users set terms_version = p_version, terms_accepted_at = now() where id = v_user;

  perform private.write_audit('account.terms_accepted', 'user', v_user, null,
    jsonb_build_object('terms_version', v_before), jsonb_build_object('terms_version', p_version));
end;
$$;

revoke all on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
