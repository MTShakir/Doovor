-- An instructor on their own calls off their lessons before their account goes (AUTH-09, R-08, D-149, D-361).
--
-- Deleting an account calls off the lessons the person was to take, so that no diary promises a
-- lesson nobody will take (D-149). It never touched the lessons they were to teach. At a school
-- that is right: the school gives them to somebody else or calls them off (D-120). But an
-- instructor running a Business on their own left lessons booked that nobody would teach and
-- nobody was left to call off, with learners' cards still to be charged the day before for some of
-- them. Somebody who is the only one left at a Business with lessons still to come is asked to call
-- them off first, which gives each learner their money or their credit back (R-08), and then to ask
-- again.

create or replace function public.request_account_deletion(p_reason text default null)
returns uuid
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
  select id into v_id from public.deletion_requests where user_id = v_user and status in ('pending', 'processing');
  if v_id is not null then
    return v_id;
  end if;

  -- Nobody else is left at a Business they run alone to see to its lessons still to come (D-361).
  if exists (
    select 1
      from public.memberships m
      join public.bookings b on b.business_id = m.business_id
     where m.user_id = v_user
       and m.role = 'owner'
       and m.status = 'active'
       and not exists (
         select 1 from public.memberships o
          where o.business_id = m.business_id and o.user_id <> v_user and o.status = 'active'
       )
       and b.starts_at > now()
       and b.status in ('confirmed', 'requested', 'pending_payment')
  ) then
    raise exception 'LESSONS_TO_COME' using errcode = 'P0001';
  end if;

  insert into public.deletion_requests (user_id, reason) values (v_user, left(p_reason, 500)) returning id into v_id;
  perform private.write_audit('account.deletion_requested', 'user', v_user, null, null, jsonb_build_object('request_id', v_id));
  return v_id;
end;
$$;
