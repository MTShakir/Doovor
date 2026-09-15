-- Sitemaps (PRD 14.6, M5-08).
--
-- What the sitemaps tell search engines about, read as anybody may: the profiles of instructors
-- search may show (private.instructor_in_search, D-113) under the city in their address, schools
-- in good standing with at least one of them, and every place page with somebody listed on it,
-- with how many, counted as city_page counts them (D-114). The app leaves out the places too thin to
-- index (packages/core/src/places.ts), so the threshold stays in one place. No dates: a profile's
-- free times and prices change without its row changing, and a date that is not true is worse
-- than none.

create or replace function public.sitemap_entries()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with searchable as (
    select i.public_slug, i.transmission, i.business_id, i.base_postcode, pc.admin_district
      from public.instructor_profiles i
      join public.businesses b on b.id = i.business_id
      left join public.postcodes pc on pc.postcode = i.base_postcode
     where i.public_slug is not null
       and private.instructor_in_search(i.verification_status, i.badge_expiry, i.is_listed, b.status)
  ),
  placed as (
    select s.transmission, d.city_slug, d.area_slug
      from searchable s
      join public.city_districts d on d.admin_district = s.admin_district
  ),
  places as (
    select p.city_slug, null::text as area_slug, false as automatic, count(*)::integer as n
      from placed p
     group by p.city_slug
    union all
    select p.city_slug, p.area_slug, false, count(*)::integer
      from placed p
     where p.area_slug is not null
     group by p.city_slug, p.area_slug
    union all
    select p.city_slug, null, true, count(*)::integer
      from placed p
     where p.transmission in ('automatic', 'both')
     group by p.city_slug
  )
  select jsonb_build_object(
           'instructors', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'slug', s.public_slug,
                          'citySlug', (select pp.city_slug from public.place_of_postcode(s.base_postcode) pp)
                        )
                        order by s.public_slug
                      )
                 from searchable s
             ),
             '[]'::jsonb
           ),
           'schools', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'slug', b.slug,
                          'citySlug', (select pp.city_slug from public.place_of_postcode(b.base_postcode) pp)
                        )
                        order by b.slug
                      )
                 from public.businesses b
                where b.type = 'school'
                  and b.status = 'active'
                  and exists (select 1 from searchable s where s.business_id = b.id)
             ),
             '[]'::jsonb
           ),
           'places', coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'citySlug', x.city_slug,
                          'areaSlug', x.area_slug,
                          'automatic', x.automatic,
                          'instructorCount', x.n
                        )
                        order by x.city_slug, x.automatic, x.area_slug nulls first
                      )
                 from places x
             ),
             '[]'::jsonb
           )
         );
$$;

revoke all on function public.sitemap_entries() from public;
grant execute on function public.sitemap_entries() to anon, authenticated;
