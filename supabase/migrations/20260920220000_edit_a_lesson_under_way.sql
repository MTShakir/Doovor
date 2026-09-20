-- A lesson being taught can still be changed (BOK-03, BOK-08, D-190).
--
-- The product owner could not find a way to edit a lesson from its card. The button was there but
-- called Move, which sounded like it only changed the time, and it disappeared the moment the
-- lesson began, which is exactly when an instructor decides to run on for another hour. The button
-- is now called Edit lesson and stays until the lesson is over, so the RPC has to accept a lesson
-- that is under way as well.

create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer default null,
  p_ignore_gap boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking public.bookings;
  v_by text;
  v_minutes integer;
  v_was integer;
  v_problem text;
  v_price integer;
  v_ignore boolean := false;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'NOT_FOUND' using errcode = '42501';
  end if;

  -- Only the instructor, or somebody who manages the Business's bookings, moves a lesson. A
  -- learner asks them (BOK-08 as amended, D-164).
  if not (
    exists (select 1 from private.auth_instructor_ids() as profile_id where profile_id = v_booking.instructor_id)
    or private.auth_has_permission(v_booking.business_id, 'manage_bookings')
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  v_by := 'instructor';
  -- Whoever may move a lesson may also say its travel gap is not needed here (D-187).
  v_ignore := p_ignore_gap;

  -- A lesson being taught can still be lengthened, which is when an instructor usually decides
  -- to (D-190). One that is over, called off or never answered cannot.
  if v_booking.status not in ('requested', 'pending_payment', 'confirmed', 'in_progress') then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "status"}';
  end if;

  v_was := (extract(epoch from (v_booking.ends_at - v_booking.starts_at)) / 60)::int;
  v_minutes := coalesce(p_duration_minutes, v_was);

  -- A different length is a different lesson to sell, so it is priced the way a new booking of
  -- that length is priced: the catalogue, or the hourly rate for a length it does not hold
  -- (R-05, D-179, D-187).
  if v_minutes <> v_was then
    v_price := private.lesson_price_for(v_booking.business_id, v_booking.lesson_type_id, v_booking.instructor_id, v_minutes);
    if v_price is null then
      raise exception 'VALIDATION_FAILED' using detail = '{"field": "duration"}';
    end if;
  end if;

  v_problem := private.slot_problem(
    v_booking.instructor_id, p_starts_at, v_minutes, v_by, v_booking.learner_id, now(), p_booking_id, v_ignore
  );
  if v_problem is not null then
    raise exception '%', v_problem using errcode = case when v_problem = 'SLOT_TAKEN' then '23P01' else 'P0001' end;
  end if;

  -- Their own lessons beside it give up as much of their travel time as this one needs (D-187).
  if v_ignore then
    update public.bookings b
       set buffer_minutes = greatest(0, floor(extract(epoch from (p_starts_at - b.ends_at)) / 60)::int)
     where b.instructor_id = v_booking.instructor_id
       and b.id <> p_booking_id
       and b.status in ('pending_payment', 'requested', 'confirmed', 'in_progress', 'completed')
       and b.blocked_range && tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_minutes), '[)')
       and not (tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_starts_at + make_interval(mins => v_minutes), '[)'))
       and b.buffer_minutes > greatest(0, floor(extract(epoch from (p_starts_at - b.ends_at)) / 60)::int);
  end if;

  update public.bookings
     set starts_at = p_starts_at,
         ends_at = p_starts_at + make_interval(mins => v_minutes),
         price_pence = coalesce(v_price, price_pence),
         buffer_minutes = case when v_ignore then 0 else buffer_minutes end,
         version = version + 1
   where id = p_booking_id;

  -- A lesson that is now a different length starts its money again (PAY-04, PAY-09, D-188):
  -- what was paid for the old length goes back exactly as calling the lesson off would give it
  -- back, with no fee, and the new length is then paid for the way a new booking is. Credit goes
  -- straight back on; a card refund goes through the refund job; cash and bank are written down
  -- as owed back, to be handed over on the learner's card.
  if v_minutes <> v_was then
    if v_booking.payment_status = 'paid_credit' then
      perform private.give_back_credit(p_booking_id, 0, v_user);
    elsif v_booking.payment_status in ('paid_card', 'paid_cash', 'paid_bank', 'partially_refunded') then
      perform private.settle_cancelled_payments(
        p_booking_id, 0, v_user,
        format('The lesson went from %s to %s minutes, so what was paid for it goes back', v_was, v_minutes)
      );
    end if;

    update public.bookings
       set payment_status = 'unpaid',
           payment_mode = private.new_booking_payment_mode(v_booking.business_id),
           credit_minutes = 0
     where id = p_booking_id;
    perform private.pay_with_credit(p_booking_id, v_user);
  end if;

  perform private.write_audit('booking.rescheduled', 'booking', p_booking_id, v_booking.business_id,
    jsonb_build_object('starts_at', v_booking.starts_at, 'minutes', v_was, 'price_pence', v_booking.price_pence),
    jsonb_build_object('starts_at', p_starts_at, 'minutes', v_minutes, 'price_pence', coalesce(v_price, v_booking.price_pence),
                       'by', v_by, 'ignored_gap', v_ignore));
  perform private.enqueue_event('booking.rescheduled',
    jsonb_build_object('booking_id', p_booking_id, 'was', v_booking.starts_at, 'now', p_starts_at));

  return p_booking_id;
end;
$$;

revoke all on function public.reschedule_booking(uuid, timestamptz, integer, boolean) from public, anon;
grant execute on function public.reschedule_booking(uuid, timestamptz, integer, boolean) to authenticated;
