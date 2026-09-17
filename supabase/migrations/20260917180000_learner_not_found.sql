-- Another Business's learner is not found (NFR-SEC-01, PRD 17.2 acceptance test 7, M5-23).
--
-- A learner the caller has no business seeing answers exactly as an id that belongs to nobody:
-- not found. The policies already hid them from every table and view; this brings the two
-- functions that read one learner by id into line, where they said "not allowed" instead.
--
-- It also closes a way in: adding a learner by hand linked whichever account id it was given, so a
-- Business holding somebody else's learner's id could attach them to itself through the API and then
-- read their name and contact details. The app only ever passes the account it has just made for the
-- learner (D-068), so that is now the only kind of account it takes (D-131).

create or replace function public.add_learner(
  p_instructor_id uuid,
  p_learner_id uuid,
  p_postcode text default null,
  p_transmission text default null,
  p_source text default 'manual',
  p_usual_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_business uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_source not in ('manual', 'import') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "source"}';
  end if;
  if p_transmission is not null and p_transmission not in ('manual', 'automatic') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "transmission"}';
  end if;

  select business_id into v_business from public.instructor_profiles where id = p_instructor_id;
  if v_business is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = p_instructor_id)
     and not private.auth_has_permission(v_business, 'manage_members') then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- Adding somebody who teaches for this Business as one of its learners is a mistake, not
  -- a feature: it would give them a second face in their own diary.
  if exists (select 1 from public.memberships where business_id = v_business and user_id = p_learner_id) then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "learner"}';
  end if;
  if exists (select 1 from public.learner_relationships where business_id = v_business and learner_id = p_learner_id) then
    raise exception 'DUPLICATE_CONTACT' using errcode = '23505';
  end if;

  -- Only the account the app has just made for this learner is linked here (D-068): one that nobody
  -- has claimed and no Business has yet. Anybody else's learner, and anybody with an account of their
  -- own, is not found, so nobody is attached to a Business by their id alone (NFR-SEC-01, D-131).
  if not exists (
       select 1
         from auth.users u
        where u.id = p_learner_id
          and u.email_confirmed_at is null
          and u.phone_confirmed_at is null
          and u.last_sign_in_at is null
     )
     or exists (select 1 from public.learner_relationships where learner_id = p_learner_id) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- Generous enough for an afternoon of typing and a spreadsheet import, not for a script.
  if not private.rate_limit_hit('add_learner:' || v_user::text, interval '1 hour', 300) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  insert into public.learner_profiles (user_id, postcode, location, transmission)
  values (
    p_learner_id,
    nullif(btrim(upper(coalesce(p_postcode, ''))), ''),
    (select location from public.postcodes where postcode = nullif(btrim(upper(coalesce(p_postcode, ''))), '')),
    nullif(p_transmission, '')::public.learner_transmission
  )
  on conflict (user_id) do update
     set postcode = coalesce(excluded.postcode, public.learner_profiles.postcode),
         location = coalesce(excluded.location, public.learner_profiles.location),
         transmission = coalesce(excluded.transmission, public.learner_profiles.transmission);

  insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, usual_duration_minutes, created_by)
  values (v_business, p_learner_id, p_instructor_id, 'active', p_source::public.learner_source, p_usual_minutes, v_user)
  returning id into v_id;

  perform private.write_audit('learner.added', 'learner_relationship', v_id, v_business, null,
    jsonb_build_object('learner_id', p_learner_id, 'instructor_profile_id', p_instructor_id, 'source', p_source));

  return v_id;
end;
$$;

create or replace function public.learner_history(p_learner_id uuid)
returns table (happened_at timestamptz, action text, before jsonb, after jsonb, actor_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not private.auth_can_see_learner(p_learner_id) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  select r.id into v_link
    from public.learner_relationships r
   where r.learner_id = p_learner_id
     and (
       r.instructor_id in (select private.auth_instructor_ids())
       or r.business_id in (select private.auth_business_ids())
     )
   limit 1;
  if v_link is null then
    return;
  end if;

  return query
    select a.occurred_at,
           a.action,
           a.before,
           a.after,
           coalesce(u.full_name, 'Somebody here')
      from public.audit_log a
      left join public.users u on u.id = a.actor_user_id
     where a.entity = 'learner_relationship'
       and a.entity_id = v_link
     order by a.occurred_at desc
     limit 50;
end;
$$;

create or replace function public.learner_balance(p_business_id uuid, p_learner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if not (
    p_learner_id = v_user
    or p_business_id in (select private.auth_business_ids(array['owner', 'manager']::public.membership_role[]))
    or exists (
      select 1 from private.auth_instructor_learners() as taught
       where taught.business_id = p_business_id
         and taught.learner_id = p_learner_id
    )
    or private.auth_is_staff()
  ) then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'credit_minutes', coalesce((
      select sum(l.minutes_remaining)::integer
        from public.credit_lots l
       where l.business_id = p_business_id
         and l.learner_id = p_learner_id
         and l.minutes_remaining > 0
         and (l.expires_at is null or l.expires_at > now())
    ), 0),

    -- Lessons that could be owed for, and lessons called off late or nobody came to whose fee
    -- nobody has paid.
    -- Which of them are owed, and since when, is decided in core.
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id,
               'starts_at', b.starts_at,
               'ends_at', b.ends_at,
               'status', b.status,
               'payment_status', b.payment_status,
               'payment_mode', b.payment_mode,
               'price_pence', b.price_pence,
               'fee_pence', coalesce(b.fee_pence, 0),
               'cancelled_at', b.cancelled_at,
               'instructor_id', b.instructor_id,
               'instructor_name', i.display_name
             ) order by b.starts_at)
        from public.bookings b
        join public.instructor_profiles i on i.id = b.instructor_id
       where b.business_id = p_business_id
         and b.learner_id = p_learner_id
         and (
           (b.status in ('confirmed', 'in_progress', 'completed')
            and b.payment_status in ('unpaid', 'pending', 'failed')
            and b.price_pence > 0)
           or (b.status in ('cancelled', 'no_show')
               and coalesce(b.fee_pence, 0) > 0
               and b.payment_status in ('unpaid', 'failed'))
         )
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          -- What is on its way back or owed back already, so nobody is offered a refund of nothing.
          select p.id, coalesce(p.paid_at, p.created_at) as at, p.amount_pence, p.method, p.refunded_pence,
                 (select coalesce(sum(r.amount_pence), 0)::integer
                    from public.refunds r
                   where r.payment_id = p.id and r.status = 'pending') as pending_refund_pence,
                 b.starts_at as lesson_at, l.minutes_total as credit_minutes,
                 exists (select 1 from public.receipts r where r.payment_id = p.id) as has_receipt
            from public.payments p
            left join public.bookings b on b.id = p.booking_id
            left join public.credit_lots l on l.payment_id = p.id
           where p.business_id = p_business_id
             and p.learner_id = p_learner_id
             and p.status in ('paid', 'refunded', 'partially_refunded')
           order by coalesce(p.paid_at, p.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    'refunds', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          -- The lesson it was for, and whose it was: cash owed back is handed back by them (M3-18).
          select r.id, coalesce(r.settled_at, r.created_at) as at, r.amount_pence, r.status, r.kind,
                 b.starts_at as lesson_at, b.instructor_id
            from public.refunds r
            left join public.bookings b on b.id = r.booking_id
           where r.business_id = p_business_id
             and r.learner_id = p_learner_id
           order by coalesce(r.settled_at, r.created_at) desc
           limit 50
        ) as recent
    ), '[]'::jsonb),

    -- What happened to credit other than buying it, which is a payment above.
    'credit', coalesce((
      select jsonb_agg(row_to_json(recent)::jsonb order by recent.at desc)
        from (
          select m.id, m.created_at as at, m.kind as move, m.minutes, b.starts_at as lesson_at
            from public.credit_ledger m
            left join public.bookings b on b.id = m.booking_id
           where m.business_id = p_business_id
             and m.learner_id = p_learner_id
             and m.kind <> 'purchase'
           order by m.created_at desc
           limit 50
        ) as recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.add_learner(uuid, uuid, text, text, text, integer) from public, anon;
revoke all on function public.learner_history(uuid) from public, anon;
revoke all on function public.learner_balance(uuid, uuid) from public, anon;
grant execute on function public.add_learner(uuid, uuid, text, text, text, integer) to authenticated;
grant execute on function public.learner_history(uuid) to authenticated;
grant execute on function public.learner_balance(uuid, uuid) to authenticated;
