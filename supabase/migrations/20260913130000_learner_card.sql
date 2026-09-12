-- Everything the learner card shows, in one row (LRN-02, M2-05).
--
-- The list view answers most of it already. The card adds the two things only it needs: the
-- hours behind the lesson count, and the pickup points, gathered here rather than fetched
-- one round trip later. The list does not carry them, because a list of forty learners has
-- no use for forty lists of addresses.

create view public.learner_card
with (security_invoker = true)
as
select l.id,
       l.business_id,
       l.learner_id,
       l.instructor_id,
       l.status,
       l.source,
       l.usual_duration_minutes,
       l.created_at,
       l.full_name,
       l.phone,
       l.email,
       l.avatar_url,
       l.transmission,
       l.postcode,
       l.instructor_name,
       l.next_lesson_at,
       l.last_lesson_at,
       l.lessons_taken,
       coalesce(taught.minutes, 0)::integer as minutes_taught,
       coalesce(pickups.points, '[]'::jsonb) as pickup_points
  from public.learner_list l
  left join lateral (
    select sum(extract(epoch from (b.ends_at - b.starts_at)) / 60) as minutes
      from public.bookings b
     where b.learner_id = l.learner_id
       and b.business_id = l.business_id
       and b.status = 'completed'
  ) taught on true
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id', p.id,
               'label', p.label,
               'address', p.address,
               'postcode', p.postcode,
               'kind', p.kind,
               'is_default', p.is_default
             )
             order by p.is_default desc, p.label
           ) as points
      from public.pickup_points p
     where p.learner_id = l.learner_id
       and (p.business_id is null or p.business_id = l.business_id)
  ) pickups on true;

comment on view public.learner_card is
  'One learner, everything their card shows, in one row (LRN-02).';

grant select on public.learner_card to authenticated;
