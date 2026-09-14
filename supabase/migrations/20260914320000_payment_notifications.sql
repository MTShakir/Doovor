-- Payment notifications (NTF-03, M3-22, PRD Appendix B).
--
--   Payment received: the instructor is told; the learner has their receipt (M3-20) and a line
--   in their inbox; a school's owners and managers get one summary of the day before, each
--   morning, rather than a message per payment. Money marked paid in person is told about once it
--   can no longer be taken back out (D-089), and not to whoever marked it.
--   Payment overdue: a lesson or fee owed for two days is told to the learner, the instructor and
--   the school, once. At a Business that takes payment in person the learner is not told: the
--   likeliest reason is cash nobody marked as paid, which is the instructor's to put right.
--   Credit running low: when using credit leaves 2 hours or less, the learner and their instructor
--   are told, once for each top-up.
--
-- The functions below say who each concerns; jobs in apps/web/src/jobs decide the words.

-- ---------------------------------------------------------------------------------------
-- A payment received.
-- ---------------------------------------------------------------------------------------

/**
 * Who a payment concerns and what it paid for, for the job that tells them (NTF-03). A payment
 * recorded in person answers `wait_until` for its first ten minutes, while it can still be taken
 * back out (D-089), and after that says who recorded it: they know already.
 */
create or replace function public.system_payment_notice(p_payment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.provider = 'offline' and p.created_at > now() - interval '10 minutes'
             then jsonb_build_object('wait_until', p.created_at + interval '10 minutes')
           else jsonb_build_object(
             'payment_id', p.id,
             'business_id', p.business_id,
             'amount_pence', p.amount_pence,
             'method', p.method,
             'booking_id', p.booking_id,
             'starts_at', b.starts_at,
             'booking_status', b.status,
             'fee_pence', b.fee_pence,
             'credit_minutes', l.minutes_total,
             'learner_user_id', p.learner_id,
             'learner_name', learner.full_name,
             -- The lesson's instructor, or for credit the learner's own.
             'instructor_user_id', coalesce(taught.user_id, assigned.user_id),
             'instructor_name', coalesce(taught.display_name, assigned.display_name),
             -- Credit bought in person keeps who added it; a lesson or fee paid in person, its audit row.
             'recorded_by', case when p.provider = 'offline' then coalesce(l.created_by, (
               select a.actor_user_id
                 from public.audit_log a
                where a.entity = 'payment' and a.entity_id = p.id and a.action = 'payment.recorded'
                order by a.occurred_at
                limit 1
             )) end
           )
         end
    from public.payments p
    join public.users learner on learner.id = p.learner_id
    left join public.bookings b on b.id = p.booking_id
    left join public.instructor_profiles taught on taught.id = b.instructor_id
    left join public.credit_lots l on l.payment_id = p.id
    left join public.learner_relationships lr on lr.business_id = p.business_id and lr.learner_id = p.learner_id
    left join public.instructor_profiles assigned on assigned.id = lr.instructor_id
   where p.id = p_payment_id
     and p.status in ('paid', 'partially_refunded', 'refunded');
$$;

/**
 * What each school took between two instants, for the summary of the day its owners and managers
 * get the next morning. Schools only: somebody running a Business of one hears about each payment.
 */
create or replace function public.system_daily_payment_summaries(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'business_id', bus.id,
           'business_name', bus.name,
           'total_pence', totals.total_pence,
           'count', totals.payments,
           'user_ids', (
             select coalesce(jsonb_agg(m.user_id order by m.user_id), '[]'::jsonb)
               from public.memberships m
              where m.business_id = bus.id
                and m.status = 'active'
                and m.role in ('owner', 'manager')
           )
         ) order by bus.id), '[]'::jsonb)
    from (
      select p.business_id, sum(p.amount_pence)::integer as total_pence, count(*)::integer as payments
        from public.payments p
       where p.status in ('paid', 'partially_refunded', 'refunded')
         and p.paid_at >= p_from and p.paid_at < p_to
       group by p.business_id
    ) as totals
    join public.businesses bus on bus.id = totals.business_id
   where bus.type = 'school';
$$;

-- ---------------------------------------------------------------------------------------
-- Owed for two days.
-- ---------------------------------------------------------------------------------------

/**
 * Lessons and fees that have been owed for two days or more, and for no more than thirty, for the
 * sweep that tells everybody once. When each was due follows the lesson's terms, the way
 * packages/core/src/balance.ts decides it for the balance (D-090).
 */
create or replace function public.system_overdue_lessons()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with owed as (
    select b.id,
           b.payment_mode,
           case
             when b.status in ('cancelled', 'no_show') then coalesce(b.cancelled_at, b.starts_at)
             when b.payment_mode = 'before_lesson' then b.starts_at - interval '24 hours'
             when b.payment_mode = 'after_lesson' then b.ends_at
             else b.starts_at
           end as due_at,
           case when b.status in ('cancelled', 'no_show') then b.fee_pence else b.price_pence end as amount_pence
      from public.bookings b
     where b.starts_at > now() - interval '32 days'
       and (
         (b.status in ('confirmed', 'in_progress', 'completed')
          and b.payment_status in ('unpaid', 'pending', 'failed')
          and b.price_pence > 0
          and b.payment_mode <> 'credit')
         or (b.status in ('cancelled', 'no_show')
             and coalesce(b.fee_pence, 0) > 0
             and b.payment_status in ('unpaid', 'failed'))
       )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'booking_id', o.id,
           'due_at', o.due_at,
           'amount_pence', o.amount_pence,
           'in_person', o.payment_mode = 'offline'
         ) order by o.due_at), '[]'::jsonb)
    from owed o
   where o.due_at <= now() - interval '48 hours'
     and o.due_at > now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------------------
-- Credit running low.
-- ---------------------------------------------------------------------------------------

/**
 * After a lesson uses credit, asks for the learner and their instructor to be told when that
 * leaves 2 hours or less and the move before it did not. Only using credit counts: a refund that
 * empties an account is not credit running low, and a fee or a return is a cancellation.
 */
create or replace function private.notice_low_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance integer;
begin
  select balance_minutes into v_balance
    from public.credit_accounts
   where business_id = new.business_id and learner_id = new.learner_id;

  if v_balance <= 120 and v_balance - new.minutes > 120 then
    perform private.enqueue_event('credit.low', jsonb_build_object(
      'business_id', new.business_id, 'learner_id', new.learner_id, 'balance_minutes', v_balance));
  end if;
  return null;
end;
$$;

-- After credit_ledger_apply, which moves the balance first: triggers fire in the order of their names.
create trigger credit_ledger_low_credit
  after insert on public.credit_ledger
  for each row when (new.kind = 'use')
  execute function private.notice_low_credit();

/**
 * Who low credit concerns (NTF-03): the learner, their instructor, what is left, and the newest
 * lot, so each top-up is told about once however often the balance moves around the line.
 */
create or replace function public.system_credit_notice(p_business_id uuid, p_learner_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'account_id', a.id,
           'business_id', a.business_id,
           'business_name', bus.name,
           'balance_minutes', a.balance_minutes,
           'latest_lot_id', (
             select l.id from public.credit_lots l
              where l.business_id = a.business_id and l.learner_id = a.learner_id
              order by l.purchased_at desc, l.id desc
              limit 1
           ),
           'learner_user_id', a.learner_id,
           'learner_name', learner.full_name,
           'instructor_user_id', instructor.user_id,
           'instructor_name', instructor.display_name
         )
    from public.credit_accounts a
    join public.businesses bus on bus.id = a.business_id
    join public.users learner on learner.id = a.learner_id
    left join public.learner_relationships lr on lr.business_id = a.business_id and lr.learner_id = a.learner_id
    left join public.instructor_profiles instructor on instructor.id = lr.instructor_id
   where a.business_id = p_business_id
     and a.learner_id = p_learner_id;
$$;

revoke all on function public.system_payment_notice(uuid) from public, anon, authenticated;
revoke all on function public.system_daily_payment_summaries(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.system_overdue_lessons() from public, anon, authenticated;
revoke all on function private.notice_low_credit() from public, anon, authenticated;
revoke all on function public.system_credit_notice(uuid, uuid) from public, anon, authenticated;
grant execute on function public.system_payment_notice(uuid) to service_role;
grant execute on function public.system_daily_payment_summaries(timestamptz, timestamptz) to service_role;
grant execute on function public.system_overdue_lessons() to service_role;
grant execute on function public.system_credit_notice(uuid, uuid) to service_role;
