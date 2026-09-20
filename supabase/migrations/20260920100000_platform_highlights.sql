-- Who stands out on the platform, over the days staff choose (ADM-01, D-172).
--
-- The product owner asked for five lists under the dashboard's figures: the schools and the
-- independent instructors who took the most money, the schools and instructors teaching the most
-- learners, and who joined in those days. They are folded away until opened, so one call brings
-- all five rather than five calls when each is unfolded.
--
--   earning:  what a Business took in the range, counted as the dashboard counts GMV: payments
--             settled in it, credit left out because it was counted when the package was bought.
--   busiest:  learners with a lesson in the range that was not called off, counted once each.
--   joined:   Businesses made in the range, newest first, one more than asked for so the screen
--             knows whether to offer more.

create or replace function private.platform_highlights_facts(p_from timestamptz, p_to timestamptz, p_joined integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with span as (
    select p_from as from_at, p_to as to_at
  ),
  takings as (
    select p.business_id, sum(p.amount_pence)::bigint as pence, count(*)::integer as payments
      from public.payments p
      cross join span s
     where p.status in ('paid', 'partially_refunded', 'refunded')
       and p.method <> 'credit'
       and p.paid_at >= s.from_at and p.paid_at < s.to_at
     group by p.business_id
  ),
  taught as (
    select k.business_id, count(distinct k.learner_id)::integer as learners, count(*)::integer as lessons
      from public.bookings k
      cross join span s
     where k.status in ('confirmed', 'in_progress', 'completed', 'no_show')
       and k.starts_at >= s.from_at and k.starts_at < s.to_at
     group by k.business_id
  ),
  earning as (
    select x.type, jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'pence', x.pence, 'payments', x.payments)
                             order by x.pence desc, x.name) as rows
      from (
        select b.id, b.name, b.type, t.pence, t.payments,
               row_number() over (partition by b.type order by t.pence desc, b.name) as place
          from public.businesses b
          join takings t on t.business_id = b.id
         where t.pence > 0
      ) x
     where x.place <= 10
     group by x.type
  ),
  busiest as (
    select x.type, jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'learners', x.learners, 'lessons', x.lessons)
                             order by x.learners desc, x.name) as rows
      from (
        select b.id, b.name, b.type, t.learners, t.lessons,
               row_number() over (partition by b.type order by t.learners desc, b.name) as place
          from public.businesses b
          join taught t on t.business_id = b.id
         where t.learners > 0
      ) x
     where x.place <= 10
     group by x.type
  ),
  joined as (
    -- One more than asked for is read, and kept back: it says only that there are more.
    select jsonb_agg(jsonb_build_object('id', j.id, 'name', j.name, 'type', j.type, 'joined_at', j.created_at)
                     order by j.created_at desc, j.name) filter (where j.place <= greatest(p_joined, 0)) as rows,
           count(*)::integer as found
      from (
        select b.id, b.name, b.type, b.created_at,
               row_number() over (order by b.created_at desc, b.name) as place
          from public.businesses b
          cross join span s
         where b.created_at >= s.from_at and b.created_at < s.to_at
         order by b.created_at desc, b.name
         limit greatest(p_joined, 0) + 1
      ) j
  )
  select jsonb_build_object(
    'earning_schools', coalesce((select e.rows from earning e where e.type = 'school'), '[]'::jsonb),
    'earning_instructors', coalesce((select e.rows from earning e where e.type = 'independent'), '[]'::jsonb),
    'busiest_schools', coalesce((select b.rows from busiest b where b.type = 'school'), '[]'::jsonb),
    'busiest_instructors', coalesce((select b.rows from busiest b where b.type = 'independent'), '[]'::jsonb),
    'joined', coalesce((select j.rows from joined j), '[]'::jsonb),
    'more', coalesce((select j.found from joined j), 0) > greatest(p_joined, 0)
  );
$$;

revoke all on function private.platform_highlights_facts(timestamptz, timestamptz, integer) from public, anon, authenticated;

/** The five lists under the dashboard, for platform staff past their second step (ADM-01, AUTH-08). */
create or replace function public.platform_highlights(p_from timestamptz, p_to timestamptz, p_joined integer)
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
  if not private.auth_is_staff() then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '5 years' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "range"}';
  end if;
  if p_joined is null or p_joined < 1 or p_joined > 100 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "joined"}';
  end if;
  return private.platform_highlights_facts(p_from, p_to, p_joined);
end;
$$;

revoke all on function public.platform_highlights(timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.platform_highlights(timestamptz, timestamptz, integer) to authenticated;
