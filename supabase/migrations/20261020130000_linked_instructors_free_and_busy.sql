-- When a linked instructor is free and busy, for the school that sends them pupils (M9-08, D-284).
--
-- A linked instructor's lessons, learners and money are theirs (D-282): the school is not a member of
-- their Business, so row level security keeps all of it from the school. What the school needs to
-- send a pupil is when they are taken, so this says that and nothing else: the start and end of each
-- lesson, and of each stretch of time off, with no learner, no lesson type and no price.

create function public.school_linked_busy(p_school_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_has_role(p_school_id, array['owner', 'manager']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- A day or a fortnight, as the diary asks for, and never a year of somebody else's diary.
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '15 days' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "range"}';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'instructorId', p.id,
             'name', coalesce(nullif(btrim(p.display_name), ''), b.name),
             'businessName', b.name,
             'transmission', p.transmission,
             'busy', coalesce((
               select jsonb_agg(jsonb_build_object('startsAt', x.starts_at, 'endsAt', x.ends_at, 'kind', x.kind) order by x.starts_at, x.kind)
                 from (
                   select bk.starts_at, bk.ends_at, 'lesson'::text as kind
                     from public.bookings bk
                    where bk.instructor_id = p.id
                      and bk.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed', 'no_show')
                      and bk.starts_at < p_to
                      and bk.ends_at > p_from
                   union all
                   select e.starts_at, e.ends_at, 'away'::text
                     from public.availability_exceptions e
                    where e.instructor_id = p.id
                      and e.kind = 'blocked'
                      and e.starts_at < p_to
                      and e.ends_at > p_from
                 ) as x
             ), '[]'::jsonb)
           ) order by coalesce(nullif(btrim(p.display_name), ''), b.name), p.id)
      from public.school_links l
      join public.businesses b on b.id = l.business_id
      join public.memberships m on m.business_id = l.business_id and m.role = 'owner' and m.status = 'active'
      join public.instructor_profiles p on p.business_id = l.business_id and p.user_id = m.user_id
     where l.school_id = p_school_id
       and l.status = 'active'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.school_linked_busy(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.school_linked_busy(uuid, timestamptz, timestamptz) to authenticated;
