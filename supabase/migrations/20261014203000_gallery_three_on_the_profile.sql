-- Three pass photos on a profile, the checked ones first, and the whole wall on a page of its own
-- (D-268).
--
-- A profile showed up to 24 photos, newest first, and a busy wall pushed everything under it a long
-- way down. The product owner asked for three, with a way to the rest. The three are the ones staff
-- have checked before the ones nobody has looked at yet, newest first within each, because the tick
-- is what makes a photo more than a picture somebody uploaded. The whole wall, on the gallery's own
-- page, is newest first, as many as 120. How many there are comes back as well, so the profile
-- knows whether there is a rest to open.
--
-- The public functions take a second argument with a default, so a call with the slug alone, as the
-- app makes it until it is deployed, still answers.

drop function public.instructor_gallery(text);
drop function public.school_gallery(text);
drop function private.gallery_of(uuid, uuid);

create function private.gallery_of(p_business_id uuid, p_instructor_id uuid, p_whole boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
           'total', (
             select count(*)
               from public.gallery_photos p
              where p.business_id = p_business_id
                and p.hidden_at is null
                and (p_instructor_id is null or p.instructor_id = p_instructor_id)
           ),
           'photos', coalesce(
             (select jsonb_agg(
                       jsonb_build_object(
                         'id', g.id,
                         'learnerName', g.learner_name,
                         'passedOn', g.passed_on,
                         'imagePath', g.image_path,
                         'width', g.image_width,
                         'height', g.image_height,
                         'verified', g.verified_at is not null
                       )
                       order by g.place
                     )
                from (
                  select p.*,
                         -- The checked ones first for a profile; on the whole wall, only the day.
                         row_number() over (
                           order by (not p_whole and p.verified_at is not null) desc, p.passed_on desc, p.created_at desc
                         ) as place
                    from public.gallery_photos p
                   where p.business_id = p_business_id
                     and p.hidden_at is null
                     and (p_instructor_id is null or p.instructor_id = p_instructor_id)
                   order by place
                   limit case when p_whole then 120 else 3 end
                ) g),
             '[]'::jsonb
           )
         );
$$;

create function public.instructor_gallery(p_slug text, p_whole boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'businessName', b.name,
           -- The banner is drawn in the Business own colour, the same one the booking page uses.
           'colour', b.brand_colour
         ) || private.gallery_of(b.id, i.id, coalesce(p_whole, false))
    from public.instructor_profiles i
    join public.businesses b on b.id = i.business_id
   where i.public_slug = p_slug
     and i.verification_status = 'approved'
     and b.status = 'active'
     and b.plan <> 'free';
$$;

revoke all on function public.instructor_gallery(text, boolean) from public;
grant execute on function public.instructor_gallery(text, boolean) to anon, authenticated;

create function public.school_gallery(p_slug text, p_whole boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'businessName', b.name,
           'colour', b.brand_colour
         -- Every instructor's, because it is the school's wall.
         ) || private.gallery_of(b.id, null, coalesce(p_whole, false))
    from public.businesses b
   where b.slug = p_slug
     and b.type = 'school'
     and b.status = 'active'
     and b.plan <> 'free';
$$;

revoke all on function public.school_gallery(text, boolean) from public;
grant execute on function public.school_gallery(text, boolean) to anon, authenticated;
