-- What the Money screen shows under the figures (MNY-01, D-195).
--
-- The dashboard says how much; these say what. Two reads, both answering the same question the
-- summary does about who may see what: somebody running the Business sees all of it, an instructor
-- sees their own lessons, and a manager the owner has not let see revenue sees none of it.

-- ---------------------------------------------------------------------------------------
-- money_transactions: money in and money back, newest first, a page at a time.
-- ---------------------------------------------------------------------------------------
create or replace function public.money_transactions(p_business_id uuid, p_limit integer, p_offset integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_whole boolean;
  v_revenue boolean;
  v_mine uuid[];
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  -- A page, not a download: the screen asks for a handful at a time and nothing else may.
  if p_limit is null or p_limit < 1 or p_limit > 50 or p_offset is null or p_offset < 0 or p_offset > 2000 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "page"}';
  end if;

  v_whole := p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
             or private.auth_is_staff();
  if not v_whole then
    select coalesce(array_agg(i.id), array[]::uuid[])
      into v_mine
      from public.instructor_profiles i
     where i.business_id = p_business_id
       and i.id in (select private.auth_instructor_ids());
    if cardinality(v_mine) = 0 then
      raise exception 'NOT_ALLOWED' using errcode = '42501';
    end if;
  end if;
  v_revenue := not v_whole or private.auth_has_permission(p_business_id, 'view_revenue') or private.auth_is_staff();
  if not v_revenue then
    return null;
  end if;

  with everything as (
    select p.id,
           coalesce(p.paid_at, p.created_at) as at,
           'payment' as kind,
           p.amount_pence,
           p.learner_id,
           u.full_name as learner_name,
           p.method::text as method,
           p.refunded_pence,
           null::text as refund_kind,
           null::text as status,
           b.starts_at as lesson_at,
           (select l.minutes_total from public.credit_lots l where l.payment_id = p.id limit 1) as credit_minutes
      from public.payments p
      join public.users u on u.id = p.learner_id
      left join public.bookings b on b.id = p.booking_id
     where p.business_id = p_business_id
       and p.status in ('paid', 'partially_refunded', 'refunded')
       and (v_whole or b.instructor_id = any (v_mine))
    union all
    -- Money going back is a transaction too, and one still waiting to be handed over says so.
    select r.id,
           coalesce(r.settled_at, r.created_at),
           'refund',
           r.amount_pence,
           r.learner_id,
           u.full_name,
           null,
           0,
           r.kind::text,
           r.status::text,
           b.starts_at,
           null
      from public.refunds r
      join public.users u on u.id = r.learner_id
      left join public.bookings b on b.id = r.booking_id
     where r.business_id = p_business_id
       and r.status in ('succeeded', 'pending')
       and (v_whole or b.instructor_id = any (v_mine))
  ),
  -- One more than asked for, which is how the screen knows whether to offer another page.
  page as (
    select * from everything order by at desc, id desc offset p_offset limit p_limit + 1
  )
  select jsonb_build_object(
           'more', (select count(*) from page) > p_limit,
           'rows', coalesce(
             (select jsonb_agg(to_jsonb(shown) order by shown.at desc, shown.id desc)
                from (select * from page order by at desc, id desc limit p_limit) shown),
             '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$$;

revoke all on function public.money_transactions(uuid, integer, integer) from public, anon;
grant execute on function public.money_transactions(uuid, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------
-- pending_refunds: cash and bank transfers owed back and not yet handed over (R-08, PAY-07).
-- ---------------------------------------------------------------------------------------
create or replace function public.pending_refunds(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_can boolean;
  v_mine uuid[];
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  -- The same people who may mark one handed back: whoever refunds for the Business, and the
  -- instructor who taught the lesson it is owed for (settle_offline_refund checks this again).
  v_can := private.auth_can_refund(p_business_id);
  select coalesce(array_agg(i.id), array[]::uuid[])
    into v_mine
    from public.instructor_profiles i
   where i.business_id = p_business_id
     and i.id in (select private.auth_instructor_ids());
  if not v_can and cardinality(v_mine) = 0 then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'id', r.id,
               'at', r.created_at,
               'amount_pence', r.amount_pence,
               'learner_id', r.learner_id,
               'learner_name', u.full_name,
               'reason', r.reason,
               'lesson_at', b.starts_at)
             -- Longest owed first: that is the one somebody is waiting on.
             order by r.created_at)
      from public.refunds r
      join public.users u on u.id = r.learner_id
      left join public.bookings b on b.id = r.booking_id
     where r.business_id = p_business_id
       and r.kind = 'offline'
       and r.status = 'pending'
       and (v_can or b.instructor_id = any (v_mine))
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.pending_refunds(uuid) from public, anon;
grant execute on function public.pending_refunds(uuid) to authenticated;
