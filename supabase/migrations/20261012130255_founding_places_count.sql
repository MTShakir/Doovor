-- How many founding places have gone, for the public site to say so (D-203, D-243).
--
-- The landing page says how many of the first hundred instructors have joined. That number is a
-- claim to the public about scarcity, and UK consumer law treats a false one as a misleading
-- action, so it is read from the same place the places are given out and nowhere else: the
-- Businesses that hold one, against the limit in the setting. It cannot say 46 while 3 have
-- joined, because there is no other number for it to say.
--
-- A count and a limit, and nothing about who. Anybody may read it, signed in or not, because the
-- page that shows it is public.

create or replace function public.founding_places()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'months', coalesce((s.value ->> 'months')::int, 12),
           'instructorLimit', coalesce((s.value ->> 'instructor_limit')::int, 0),
           'instructorsJoined', (select count(*)::int from public.businesses
                                  where founding_offer and type = 'independent'),
           'schoolLimit', coalesce((s.value ->> 'school_limit')::int, 0),
           'schoolsJoined', (select count(*)::int from public.businesses
                              where founding_offer and type = 'school')
         )
    from public.platform_settings s
   where s.key = 'founding_offer';
$$;

comment on function public.founding_places() is
  'How many founding places are taken, against the limit, for the public site (D-203, D-243).';

revoke all on function public.founding_places() from public;
grant execute on function public.founding_places() to anon, authenticated;
