-- Notices about a school's own arrangements (M9-28, NTF-03, D-295).
--
-- A pupil offered to a linked instructor and one taken, the fee terms a school sets a linked
-- instructor, each fee raised and each settled, a learner asked whether to move, and a link or an
-- instructor's membership of a school ending: each change queues one event in the same
-- transaction, as a booking does (D-017), and the job reads what to say through
-- `system_school_notice`. An event carries the kind of notice and the row's id, nothing about
-- anybody (ARCHITECTURE 9). The words are packages/core's, as for every other notice.

-- ---------------------------------------------------------------------------------------
-- Queuing: one trigger function, told the kind by the trigger.
-- ---------------------------------------------------------------------------------------
create function private.queue_school_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_event('school.notice', jsonb_build_object('kind', tg_argv[0], 'id', new.id));
  return null;
end;
$$;

revoke all on function private.queue_school_notice() from public, anon, authenticated;

-- A pupil offered, or offered again once an offer lapsed or was declined, and one taken.
create trigger school_enquiry_offers_offered_notice
  after insert on public.school_enquiry_offers
  for each row execute function private.queue_school_notice('pupil.offered');

create trigger school_enquiry_offers_offered_again_notice
  after update of status, created_at on public.school_enquiry_offers
  for each row when (new.status = 'open' and (old.status <> 'open' or old.created_at <> new.created_at))
  execute function private.queue_school_notice('pupil.offered');

create trigger school_enquiry_offers_taken_notice
  after update of status on public.school_enquiry_offers
  for each row when (new.status = 'accepted' and old.status <> 'accepted')
  execute function private.queue_school_notice('pupil.taken');

-- The fees a linked instructor pays, when they change, and the link when it ends.
create trigger school_links_fee_terms_notice
  after update of fee_period, fee_pence, fees_start_on, free_weeks, pupil_fee_pence on public.school_links
  for each row when (
    (old.fee_period, old.fee_pence, old.fees_start_on, old.free_weeks, old.pupil_fee_pence)
      is distinct from (new.fee_period, new.fee_pence, new.fees_start_on, new.free_weeks, new.pupil_fee_pence)
  )
  execute function private.queue_school_notice('school_fee.terms_set');

create trigger school_links_ended_notice
  after update of status on public.school_links
  for each row when (new.status = 'ended' and old.status = 'active')
  execute function private.queue_school_notice('school.link_ended');

-- Each fee as it is raised, by the hourly job or a pupil's first lesson, and as it is settled.
create trigger school_fees_raised_notice
  after insert on public.school_fees
  for each row execute function private.queue_school_notice('school_fee.due');

create trigger school_fees_settled_notice
  after update of status on public.school_fees
  for each row when (new.status in ('paid', 'written_off') and new.status is distinct from old.status)
  execute function private.queue_school_notice('school_fee.settled');

-- A learner asked whether to move (D-292).
create trigger learner_moves_asked_notice
  after insert on public.learner_moves
  for each row execute function private.queue_school_notice('learner.move_asked');

-- An instructor switched off. Whether it was at a school is the reader's to say.
create trigger memberships_switched_off_notice
  after update of status on public.memberships
  for each row when (new.status = 'deactivated' and old.status = 'active' and new.role = 'instructor')
  execute function private.queue_school_notice('school.member_left');

-- ---------------------------------------------------------------------------------------
-- Reading: who hears, and the facts the words are made from.
-- ---------------------------------------------------------------------------------------

-- The people with these roles at a Business, still there, as one audience.
create function private.school_notice_people(p_business_id uuid, p_roles public.membership_role[], p_audience text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'audience', p_audience) order by m.created_at, m.user_id), '[]'::jsonb)
    from public.memberships m
    join public.users u on u.id = m.user_id
   where m.business_id = p_business_id
     and m.role = any(p_roles)
     and m.status = 'active'
     and u.deleted_at is null;
$$;

-- One person, unless their account has been deleted since.
create function private.school_notice_person(p_user_id uuid, p_audience text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'audience', p_audience)), '[]'::jsonb)
    from public.users u
   where u.id = p_user_id
     and u.deleted_at is null;
$$;

-- The instructor a linked Business is, by the name they teach under, or the Business's own.
create function private.linked_instructor_name(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.display_name from public.instructor_profiles p where p.business_id = p_business_id order by p.created_at limit 1),
    (select b.name from public.businesses b where b.id = p_business_id)
  );
$$;

revoke all on function private.school_notice_people(uuid, public.membership_role[], text) from public, anon, authenticated;
revoke all on function private.school_notice_person(uuid, text) from public, anon, authenticated;
revoke all on function private.linked_instructor_name(uuid) from public, anon, authenticated;

/**
 * What to say about one change, and to whom. Null when the row is gone, or has moved on from
 * what the notice is about: an offer taken before the job ran is not offered to anybody.
 */
create function public.system_school_notice(p_kind text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offer public.school_enquiry_offers;
  v_enquiry public.school_enquiries;
  v_link public.school_links;
  v_fee public.school_fees;
  v_move public.learner_moves;
  v_member public.memberships;
begin
  if p_kind in ('pupil.offered', 'pupil.taken') then
    select * into v_offer from public.school_enquiry_offers where id = p_id;
    if v_offer.id is null
       or (p_kind = 'pupil.offered' and (v_offer.status <> 'open' or v_offer.expires_at <= now()))
       or (p_kind = 'pupil.taken' and v_offer.status <> 'accepted') then
      return null;
    end if;
    select * into v_enquiry from public.school_enquiries where id = v_offer.enquiry_id;
    if p_kind = 'pupil.offered' then
      -- As much as the instructor sees before accepting: a first name, a district, a gearbox (D-289).
      return jsonb_build_object(
        'kind', 'pupil.offered',
        'business_id', v_offer.business_id,
        'entity_type', 'school_enquiry_offer',
        'entity_id', v_offer.id,
        -- Offered again after it lapsed is a new offer, and a new notice.
        'version', (extract(epoch from v_offer.created_at) * 1000000)::bigint::text,
        'recipients', private.school_notice_people(v_offer.business_id, array['owner']::public.membership_role[], 'instructor'),
        'school_name', (select b.name from public.businesses b where b.id = v_offer.school_id),
        'learner_name', split_part(btrim(v_enquiry.full_name), ' ', 1),
        'area', split_part(v_enquiry.postcode, ' ', 1),
        'transmission', v_enquiry.transmission,
        'expires_at', v_offer.expires_at
      );
    end if;
    return jsonb_build_object(
      'kind', 'pupil.taken',
      'business_id', v_offer.school_id,
      'entity_type', 'school_enquiry_offer',
      'entity_id', v_offer.id,
      'version', null,
      'recipients', private.school_notice_people(v_offer.school_id, array['owner', 'manager']::public.membership_role[], 'school'),
      'learner_name', v_enquiry.full_name,
      'instructor_name', private.linked_instructor_name(v_offer.business_id)
    );
  end if;

  if p_kind = 'school_fee.terms_set' then
    select * into v_link from public.school_links where id = p_id;
    if v_link.id is null or v_link.status <> 'active' then
      return null;
    end if;
    return jsonb_build_object(
      'kind', 'school_fee.terms_set',
      'business_id', v_link.business_id,
      'entity_type', 'school_link',
      'entity_id', v_link.id,
      -- Each change of terms is its own notice, even back to what they were before.
      'version', (extract(epoch from v_link.updated_at) * 1000000)::bigint::text,
      'recipients', private.school_notice_people(v_link.business_id, array['owner']::public.membership_role[], 'instructor'),
      'school_name', (select b.name from public.businesses b where b.id = v_link.school_id),
      'terms', jsonb_build_object(
        'period', v_link.fee_period,
        'fee_pence', v_link.fee_pence,
        'fees_start_on', v_link.fees_start_on,
        'free_weeks', v_link.free_weeks,
        'pupil_fee_pence', v_link.pupil_fee_pence
      )
    );
  end if;

  if p_kind in ('school_fee.due', 'school_fee.settled') then
    select * into v_fee from public.school_fees where id = p_id;
    if v_fee.id is null
       or (p_kind = 'school_fee.due' and v_fee.status <> 'owed')
       or (p_kind = 'school_fee.settled' and v_fee.status not in ('paid', 'written_off')) then
      return null;
    end if;
    return jsonb_build_object(
      'kind', p_kind,
      'business_id', v_fee.business_id,
      'entity_type', 'school_fee',
      'entity_id', v_fee.id,
      -- Paid, put back to owed and paid again is two notices.
      'version', case when p_kind = 'school_fee.settled'
                   then v_fee.status::text || ':' || (extract(epoch from v_fee.settled_at) * 1000000)::bigint::text end,
      'recipients', private.school_notice_people(v_fee.business_id, array['owner']::public.membership_role[], 'instructor'),
      'school_name', (select b.name from public.businesses b where b.id = v_fee.school_id),
      'outcome', case when p_kind = 'school_fee.settled' then v_fee.status::text end,
      'fee', jsonb_build_object(
        'kind', v_fee.kind,
        'amount_pence', v_fee.amount_pence,
        'period_starts_on', v_fee.period_starts_on,
        'period_ends_on', v_fee.period_ends_on,
        'learner_name', (select u.full_name from public.users u where u.id = v_fee.learner_id)
      )
    );
  end if;

  if p_kind = 'learner.move_asked' then
    select * into v_move from public.learner_moves where id = p_id;
    if v_move.id is null or v_move.status <> 'asked' then
      return null;
    end if;
    return jsonb_build_object(
      'kind', 'learner.move_asked',
      'business_id', v_move.from_business_id,
      'entity_type', 'learner_move',
      'entity_id', v_move.id,
      'version', null,
      'recipients', private.school_notice_person(v_move.learner_id, 'learner'),
      -- Where they would move to, and where from: the same names as the choice on their home screen.
      'school_name', (select b.name from public.businesses b where b.id = v_move.to_business_id),
      'business_name', (select b.name from public.businesses b where b.id = v_move.from_business_id),
      'instructor_name', coalesce(
        (select p.display_name from public.instructor_profiles p where p.id = v_move.instructor_id),
        private.linked_instructor_name(v_move.from_business_id)
      ),
      'outcome', v_move.reason
    );
  end if;

  if p_kind = 'school.link_ended' then
    select * into v_link from public.school_links where id = p_id;
    if v_link.id is null or v_link.status <> 'ended' then
      return null;
    end if;
    -- The side that did not end it is the one to tell.
    return jsonb_build_object(
      'kind', 'school.left',
      'business_id', case when v_link.end_reason = 'left' then v_link.school_id else v_link.business_id end,
      'entity_type', 'school_link',
      'entity_id', v_link.id,
      'version', null,
      'recipients', case when v_link.end_reason = 'left'
                      then private.school_notice_people(v_link.school_id, array['owner', 'manager']::public.membership_role[], 'school')
                      else private.school_notice_people(v_link.business_id, array['owner']::public.membership_role[], 'instructor') end,
      'school_name', (select b.name from public.businesses b where b.id = v_link.school_id),
      'instructor_name', private.linked_instructor_name(v_link.business_id),
      'outcome', v_link.end_reason
    );
  end if;

  if p_kind = 'school.member_left' then
    select * into v_member from public.memberships where id = p_id;
    if v_member.id is null
       or v_member.status <> 'deactivated'
       or v_member.role <> 'instructor'
       or not exists (select 1 from public.businesses b where b.id = v_member.business_id and b.type = 'school') then
      return null;
    end if;
    return jsonb_build_object(
      'kind', 'school.left',
      'business_id', v_member.business_id,
      'entity_type', 'membership',
      'entity_id', v_member.id,
      -- Switched off, on again and off again is two notices.
      'version', (extract(epoch from v_member.updated_at) * 1000000)::bigint::text,
      'recipients', private.school_notice_person(v_member.user_id, 'instructor'),
      'school_name', (select b.name from public.businesses b where b.id = v_member.business_id),
      -- Their own Business, paused to teach here, which they can open again (D-292).
      'business_name', (
        select b.name
          from public.businesses b
          join public.memberships m on m.business_id = b.id and m.user_id = v_member.user_id and m.role = 'owner'
         where b.paused_for = v_member.business_id and b.paused_at is not null
         limit 1
      ),
      'outcome', 'switched_off'
    );
  end if;

  return null;
end;
$$;

revoke all on function public.system_school_notice(text, uuid) from public, anon, authenticated;
grant execute on function public.system_school_notice(text, uuid) to service_role;
