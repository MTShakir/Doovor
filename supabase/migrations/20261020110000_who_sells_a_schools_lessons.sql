-- Who sells a school's lessons (M9-04, D-281).
--
-- A school sells its lessons itself, through instructors who teach under it, or its instructors sell
-- their own, each through their own Business, with the school sending them pupils for a fee; or some
-- of each (D-278). Which one decides who learners pay, whose prices they pay and whose takings count
-- for VAT (HMRC VTAXPER66100), so the school says which, and only its owner may change it.

create type public.lesson_seller as enum ('school', 'instructors', 'both');

alter table public.businesses
  add column lesson_seller public.lesson_seller;

comment on column public.businesses.lesson_seller is
  'Who sells a school''s lessons: the school, through the instructors who teach under it; its instructors, each through their own Business; or both (D-281). Empty until a new school says, which reads as the school; only a school''s is read.';

-- Every school here already sells its lessons itself: that is all a school could do before.
update public.businesses set lesson_seller = 'school' where type = 'school';

grant select (lesson_seller) on public.businesses to authenticated;

-- ---------------------------------------------------------------------------------------
-- set_lesson_seller: the owner says who sells the school's lessons.
-- ---------------------------------------------------------------------------------------
create function public.set_lesson_seller(p_business_id uuid, p_seller public.lesson_seller)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.lesson_seller;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_seller is null then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "seller"}';
  end if;
  if not exists (select 1 from public.businesses b where b.id = p_business_id and b.type = 'school') then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  -- What the school sells as is the owner's to say, as what it pays is (PRD 6.2).
  if not private.auth_has_role(p_business_id, array['owner']::public.membership_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  select lesson_seller into v_before from public.businesses where id = p_business_id for update;
  if v_before is not distinct from p_seller then
    return;
  end if;

  -- A school whose instructors sell their own lessons has nobody teaching under it: while some
  -- still do, it is both.
  if p_seller = 'instructors' and exists (
    select 1
      from public.memberships m
      join public.instructor_profiles p on p.business_id = m.business_id and p.user_id = m.user_id
     where m.business_id = p_business_id and m.status = 'active'
  ) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "seller", "reason": "instructors_teach_here"}';
  end if;

  update public.businesses set lesson_seller = p_seller where id = p_business_id;

  perform private.write_audit('school.lesson_seller_set', 'business', p_business_id, p_business_id,
    jsonb_build_object('lesson_seller', v_before), jsonb_build_object('lesson_seller', p_seller));
end;
$$;

revoke all on function public.set_lesson_seller(uuid, public.lesson_seller) from public, anon;
grant execute on function public.set_lesson_seller(uuid, public.lesson_seller) to authenticated;
