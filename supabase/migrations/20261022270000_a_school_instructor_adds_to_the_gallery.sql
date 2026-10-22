-- An instructor or manager at a school on a paid plan adds pass photos to its gallery (D-218, D-374).
--
-- An instructor at a school posts their own pass photos onto the school's wall, and
-- `add_gallery_photo` lets them while the plan carries it. The screens asked whether it did by
-- reading the plan through `business_billing`, which is the owner's (D-123), so an instructor or
-- manager at a school on the School plan was told the gallery is part of Pro and offered nothing
-- to press. Found in the A to Z round on 22 Oct 2026. This answers the one question the screens
-- need, for anybody who works at the Business, and says nothing else about its billing.

create function public.gallery_is_open(p_business_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not (private.auth_is_member(p_business_id) or private.auth_is_staff('super')) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- The rule add_gallery_photo keeps: every plan but Free carries the gallery.
  return coalesce((select b.plan <> 'free' from public.businesses b where b.id = p_business_id), false);
end;
$$;

revoke all on function public.gallery_is_open(uuid) from public, anon;
grant execute on function public.gallery_is_open(uuid) to authenticated;
