-- Deleting an account: the person goes, the money stays (NFR-PRV-03, AUTH-09, M6-12, D-149).
--
-- A request waits seven days, so somebody who changes their mind can say so, and is then carried
-- out by the job runner. What happens is not a delete of everything: the law says a Business keeps
-- its financial records for six years, and a lesson that happened is the Business's record of its
-- own trading. So the person is taken out of those records rather than the records out of the
-- product: their name, address, contact details, date of birth, licence number, notes about them,
-- their devices and what they chose to be told about all go, and what is left says only that
-- somebody paid, when, and how much.
--
-- Nobody can sign in afterwards. The account is banned the same way a suspension bans one
-- (D-126), which both refuses a new sign in and ends every session already open.

-- ---------------------------------------------------------------------------------------
-- Changing your mind, while the seven days last.
-- ---------------------------------------------------------------------------------------
create or replace function public.cancel_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.deletion_requests
     set status = 'cancelled', updated_at = now()
   where user_id = v_user
     and status = 'pending'
  returning id into v_id;

  if v_id is null then
    return false;
  end if;

  perform private.write_audit('account.deletion_cancelled', 'user', v_user, null, null, jsonb_build_object('request_id', v_id));
  return true;
end;
$$;

comment on function public.cancel_account_deletion() is 'Calls off a deletion while it is still waiting (AUTH-09, D-149).';

revoke all on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ---------------------------------------------------------------------------------------
-- Carrying one out. Called by the job runner, never by a person.
-- ---------------------------------------------------------------------------------------
create or replace function public.system_erase_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  -- A lesson still to come is called off: a diary that promises a lesson nobody will teach or take
  -- is worse than an empty one. The money for it stays where it is, and the Business settles it.
  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = 'The learner closed their account',
         updated_at = now()
   where learner_id = p_user_id
     and starts_at > now()
     and status in ('confirmed', 'requested', 'pending_payment');

  -- Their part of every Business they learn with ends.
  update public.learner_relationships
     set status = 'left', updated_at = now()
   where learner_id = p_user_id
     and status <> 'left';

  -- What a Business wrote about them goes: it is about a person, and there is no person now.
  delete from public.learner_notes where learner_id = p_user_id;
  delete from public.learner_private where user_id = p_user_id;
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.notification_preferences where user_id = p_user_id;
  delete from public.notifications where user_id = p_user_id;
  delete from public.invitations where lower(email) = (select lower(u.email) from public.users u where u.id = p_user_id);

  update public.learner_profiles
     set postcode = null,
         location = null,
         updated_at = now()
   where user_id = p_user_id;

  -- An instructor's public profile goes with them: no booking link, nothing in search, no words
  -- or picture of theirs left on it. What the Business keeps is that somebody taught the lessons.
  update public.instructor_profiles
     set display_name = 'Former instructor',
         bio = null,
         photo_path = null,
         languages = '{}',
         badge_number = null,
         public_slug = null,
         is_listed = false,
         base_postcode = null,
         base_location = null,
         updated_at = now()
   where user_id = p_user_id;

  -- And their way in to every Business.
  update public.memberships
     set status = 'deactivated', updated_at = now()
   where user_id = p_user_id
     and status <> 'deactivated';

  -- The account itself: banned for good, with nothing left to sign in with, and every session
  -- already open ended (D-126 does the refusing).
  delete from auth.identities where user_id = p_user_id;
  delete from auth.sessions where user_id = p_user_id;
  update auth.users
     set email = 'deleted+' || p_user_id::text || '@invalid',
         phone = null,
         encrypted_password = null,
         email_change = '',
         phone_change = '',
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '1000 years',
         updated_at = now()
   where id = p_user_id;

  -- The person, in our own records. After the account above, because a change to its email is
  -- mirrored into this row by a trigger, and what should be left here is nothing.
  update public.users
     set full_name = 'Deleted account',
         email = null,
         phone = null,
         avatar_url = null,
         marketing_consent = false,
         marketing_consent_at = null,
         analytics_consent = false,
         intended_role = null,
         deleted_at = now(),
         updated_at = now()
   where id = p_user_id;

  select b.id into v_business from public.businesses b
    join public.memberships m on m.business_id = b.id
   where m.user_id = p_user_id
   limit 1;
  perform private.write_audit('account.deleted', 'user', p_user_id, v_business, null, null, p_user_id, 'system');
end;
$$;

comment on function public.system_erase_account(uuid) is 'Takes the person out of the records the law says a Business keeps (NFR-PRV-03, D-149).';

revoke all on function public.system_erase_account(uuid) from public, anon, authenticated;
grant execute on function public.system_erase_account(uuid) to service_role;

-- ---------------------------------------------------------------------------------------
-- The job: every request past its seven days.
-- ---------------------------------------------------------------------------------------
create or replace function public.system_due_deletions(p_now timestamptz default now())
returns table (request_id uuid, user_id uuid, requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.user_id, d.requested_at
    from public.deletion_requests d
   where d.status = 'pending'
     and d.requested_at <= p_now - interval '7 days'
   order by d.requested_at;
$$;

revoke all on function public.system_due_deletions(timestamptz) from public, anon, authenticated;
grant execute on function public.system_due_deletions(timestamptz) to service_role;

create or replace function public.system_finish_deletion(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  update public.deletion_requests
     set status = 'processing', updated_at = now()
   where id = p_request_id
     and status = 'pending'
  returning user_id into v_user;

  if v_user is null then
    return;
  end if;

  perform public.system_erase_account(v_user);

  update public.deletion_requests
     set status = 'completed', processed_at = now(), updated_at = now()
   where id = p_request_id;
end;
$$;

comment on function public.system_finish_deletion(uuid) is 'Carries out one deletion request, start to finish (D-149).';

revoke all on function public.system_finish_deletion(uuid) from public, anon, authenticated;
grant execute on function public.system_finish_deletion(uuid) to service_role;
