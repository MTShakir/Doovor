-- Fees still owed after a link ends (D-287, D-313).
--
-- A link that ends raises no new fees, but the fees it raised are still owed: the school's Money
-- screen counted them, while both Fees screens showed active links only, so nobody could see them
-- or mark them paid. This answers, for a school or for the linked instructor's own Business, each
-- ended link that still has something owed, with the names its screens show. Each side reads its
-- own: the school's owner and managers, or the linked Business's owner.

create function public.links_still_owing(p_business_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'linkId', l.id,
           'schoolName', s.name,
           'businessName', b.name,
           'instructorName', private.linked_instructor_name(l.business_id),
           'endedOn', (l.ended_at at time zone 'Europe/London')::date
         ) order by l.ended_at desc), '[]'::jsonb)
    from public.school_links l
    join public.businesses s on s.id = l.school_id
    join public.businesses b on b.id = l.business_id
   where l.status = 'ended'
     and (l.school_id = p_business_id or l.business_id = p_business_id)
     and private.auth_has_role(p_business_id, array['owner', 'manager']::public.membership_role[])
     and exists (select 1 from public.school_fees f where f.link_id = l.id and f.status = 'owed');
$$;

revoke all on function public.links_still_owing(uuid) from public, anon;
grant execute on function public.links_still_owing(uuid) to authenticated;
