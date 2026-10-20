-- Where a learner came from, and the fee for a pupil a school introduced (M9-19, M9-20, D-290).
--
-- A pupil a school found and passed on keeps that on the relationship: `introduced_by` is the
-- school. A linked instructor who accepted a pupil puts them on their own list from Your school,
-- and the school's fee for each pupil it introduces falls due once, when their first lesson with
-- that instructor is booked. A pupil the school gives to one of its own instructors is introduced
-- by the school too, and pays no such fee: the school sells those lessons itself.

alter table public.learner_relationships
  add column introduced_by uuid references public.businesses (id) on delete set null;

comment on column public.learner_relationships.introduced_by is
  'The school that found this learner and passed them on; null for a learner who came to the Business some other way (D-290).';

-- The fee for a pupil introduced, at most once for each pupil and link, with their name kept for
-- the statement: the school knows it already, from the enquiry.
alter table public.school_fees add column learner_name text check (char_length(learner_name) <= 120);
create unique index school_fees_one_per_pupil on public.school_fees (link_id, learner_id) where kind = 'pupil';

-- ---------------------------------------------------------------------------------------
-- add_enquiry_learner: the linked instructor who accepted a pupil puts them on their own list.
-- The app has just made the account they will claim (D-068).
-- ---------------------------------------------------------------------------------------
create function public.add_enquiry_learner(p_enquiry_id uuid, p_learner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry public.school_enquiries;
  v_profile uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_enquiry from public.school_enquiries where id = p_enquiry_id for update;
  if v_enquiry.id is null or v_enquiry.status <> 'taken' or v_enquiry.taken_business_id is null
     or not private.auth_has_role(v_enquiry.taken_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if v_enquiry.taken_learner_id is not null then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "already_added"}';
  end if;
  select p.id into v_profile
    from public.instructor_profiles p
   where p.business_id = v_enquiry.taken_business_id and p.user_id = (select auth.uid());
  if v_profile is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  perform public.add_learner(v_profile, p_learner_id, v_enquiry.postcode, v_enquiry.transmission::text, 'manual');
  update public.learner_relationships
     set introduced_by = v_enquiry.school_id
   where business_id = v_enquiry.taken_business_id and learner_id = p_learner_id;
  update public.school_enquiries set taken_learner_id = p_learner_id where id = v_enquiry.id;

  perform private.write_audit('school.enquiry_learner_added', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
    null, jsonb_build_object('business_id', v_enquiry.taken_business_id));
end;
$$;

revoke all on function public.add_enquiry_learner(uuid, uuid) from public, anon;
grant execute on function public.add_enquiry_learner(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- A pupil given to one of the school's own instructors was introduced by the school as well.
-- ---------------------------------------------------------------------------------------
create or replace function public.give_school_enquiry(p_enquiry_id uuid, p_instructor_id uuid, p_learner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enquiry public.school_enquiries;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_enquiry from public.school_enquiries where id = p_enquiry_id for update;
  if v_enquiry.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not private.auth_has_permission(v_enquiry.school_id, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_enquiry.status not in ('new', 'offered') then
    raise exception 'VALIDATION_FAILED' using detail = '{"reason": "not_open"}';
  end if;
  if not exists (
    select 1
      from public.instructor_profiles p
      join public.memberships m on m.business_id = p.business_id and m.user_id = p.user_id and m.status = 'active'
     where p.id = p_instructor_id and p.business_id = v_enquiry.school_id
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "instructor"}';
  end if;

  perform public.add_learner(p_instructor_id, p_learner_id, v_enquiry.postcode, v_enquiry.transmission::text, 'manual');
  update public.learner_relationships
     set introduced_by = v_enquiry.school_id
   where business_id = v_enquiry.school_id and learner_id = p_learner_id;
  perform private.withdraw_enquiry_offers(v_enquiry.id);
  update public.school_enquiries
     set status = 'taken',
         taken_business_id = v_enquiry.school_id,
         taken_instructor_id = p_instructor_id,
         taken_learner_id = p_learner_id,
         taken_at = now()
   where id = v_enquiry.id;

  perform private.write_audit('school.enquiry_given', 'school_enquiry', v_enquiry.id, v_enquiry.school_id,
    jsonb_build_object('status', v_enquiry.status), jsonb_build_object('status', 'taken', 'instructor_id', p_instructor_id));
end;
$$;

-- ---------------------------------------------------------------------------------------
-- The fee for a pupil introduced: once, when their first lesson with the linked instructor is
-- booked, at what the link says then. A lesson booked for the school's own learner raises none.
-- ---------------------------------------------------------------------------------------
create function private.raise_pupil_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_link public.school_links;
begin
  select r.introduced_by into v_school
    from public.learner_relationships r
   where r.business_id = new.business_id and r.learner_id = new.learner_id;
  if v_school is null or v_school = new.business_id then
    return new;
  end if;
  select * into v_link
    from public.school_links l
   where l.school_id = v_school and l.business_id = new.business_id and l.status = 'active';
  if v_link.id is null or v_link.pupil_fee_pence is null then
    return new;
  end if;

  insert into public.school_fees (link_id, school_id, business_id, kind, learner_id, learner_name, amount_pence, due_on)
  values (v_link.id, v_school, new.business_id, 'pupil', new.learner_id,
          (select left(u.full_name, 120) from public.users u where u.id = new.learner_id),
          v_link.pupil_fee_pence, private.today())
  on conflict do nothing;
  return new;
end;
$$;

create trigger bookings_pupil_fee
  after insert on public.bookings
  for each row
  when (new.status in ('pending_payment', 'requested', 'confirmed'))
  execute function private.raise_pupil_fee();

-- ---------------------------------------------------------------------------------------
-- learner_introduced_by: the name of the school that introduced a learner, for somebody at the
-- Business that teaches them. The school's own row stays the school's to read.
-- ---------------------------------------------------------------------------------------
create function public.learner_introduced_by(p_learner_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.name
    from public.learner_relationships r
    join public.businesses s on s.id = r.introduced_by
   where r.learner_id = p_learner_id
     and r.business_id in (select private.auth_business_ids())
     and r.introduced_by <> r.business_id
   limit 1;
$$;

revoke all on function public.learner_introduced_by(uuid) from public, anon;
grant execute on function public.learner_introduced_by(uuid) to authenticated;
