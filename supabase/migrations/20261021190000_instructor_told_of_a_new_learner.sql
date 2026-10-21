-- An instructor is told when the school gives them a learner (NTF-03, LRN-06, SCH-03, D-325).
--
-- The office chose who teaches a learner, on its learner list, from its new pupils or adding one
-- by hand, and the instructor it chose heard nothing: Mona found Pat on her list by chance. The
-- product owner decided she should be told (21 Oct).
--
-- Giving somebody a learner queues `learner.assigned` with the learner's link to the school, and
-- the reader names whoever has them now. Only the office giving them is news: an instructor adding
-- their own learner, or a learner moving with the instructor they came with, who hears about it as
-- `learner.moved` (D-306), is not. Only at a school, since an instructor on their own gives their
-- learners to nobody.
--
-- system_school_notice is the function from 20261021090000_learner_moved_notice, with
-- `learner.assigned` added.

create function private.given_by_the_office(p_business_id uuid, p_instructor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school')
     and private.auth_has_permission(p_business_id, 'manage_members')
     and not exists (
       select 1 from public.instructor_profiles p where p.id = p_instructor_id and p.user_id = (select auth.uid())
     );
$$;

revoke all on function private.given_by_the_office(uuid, uuid) from public, anon, authenticated;

create trigger learner_relationships_given_notice
  after insert on public.learner_relationships
  for each row when (new.instructor_id is not null and private.given_by_the_office(new.business_id, new.instructor_id))
  execute function private.queue_school_notice('learner.assigned');

create trigger learner_relationships_given_again_notice
  after update of instructor_id on public.learner_relationships
  for each row when (
    new.instructor_id is not null
    and new.instructor_id is distinct from old.instructor_id
    and private.given_by_the_office(new.business_id, new.instructor_id)
  )
  execute function private.queue_school_notice('learner.assigned');

/**
 * What to say about one change, and to whom. Null when the row is gone, or has moved on from
 * what the notice is about: an offer taken before the job ran is not offered to anybody.
 */
create or replace function public.system_school_notice(p_kind text, p_id uuid)
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
  v_learner public.learner_relationships;
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

  -- A learner who chose to move (D-306): the school they moved to, and the instructor they came with.
  if p_kind = 'learner.moved' then
    select * into v_move from public.learner_moves where id = p_id;
    if v_move.id is null or v_move.status <> 'moved' then
      return null;
    end if;
    return jsonb_build_object(
      'kind', 'learner.moved',
      'business_id', v_move.to_business_id,
      'entity_type', 'learner_move',
      'entity_id', v_move.id,
      'version', null,
      -- Their instructor first, so somebody who is both hears it as the one teaching them.
      'recipients', coalesce(
          (select private.school_notice_person(p.user_id, 'instructor') from public.instructor_profiles p where p.id = v_move.instructor_id),
          '[]'::jsonb
        ) || private.school_notice_people(v_move.to_business_id, array['owner', 'manager']::public.membership_role[], 'school'),
      -- Whose card their instructor opens.
      'learner_id', v_move.learner_id,
      'learner_name', (select nullif(btrim(u.full_name), '') from public.users u where u.id = v_move.learner_id),
      'school_name', (select b.name from public.businesses b where b.id = v_move.to_business_id),
      'business_name', (select b.name from public.businesses b where b.id = v_move.from_business_id),
      -- Nobody, for one back from a linked instructor: the school chooses.
      'instructor_name', (select p.display_name from public.instructor_profiles p where p.id = v_move.instructor_id),
      'outcome', v_move.reason
    );
  end if;

  -- A learner the school gave one of its instructors (D-325): theirs to get in touch with.
  if p_kind = 'learner.assigned' then
    select * into v_learner from public.learner_relationships where id = p_id;
    if v_learner.id is null
       or v_learner.instructor_id is null
       or v_learner.status not in ('enquiry', 'waiting', 'active', 'test_booked') then
      return null;
    end if;
    return jsonb_build_object(
      'kind', 'learner.assigned',
      'business_id', v_learner.business_id,
      'entity_type', 'learner_relationship',
      'entity_id', v_learner.id,
      -- Given to somebody else and back again is news again; two events for one change are not.
      'version', (extract(epoch from v_learner.updated_at) * 1000000)::bigint::text,
      -- Whoever has them now, which is who the school chose last.
      'recipients', coalesce(
        (select private.school_notice_person(p.user_id, 'instructor') from public.instructor_profiles p where p.id = v_learner.instructor_id),
        '[]'::jsonb
      ),
      'learner_id', v_learner.learner_id,
      'learner_name', (select nullif(btrim(u.full_name), '') from public.users u where u.id = v_learner.learner_id),
      'school_name', (select b.name from public.businesses b where b.id = v_learner.business_id)
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
