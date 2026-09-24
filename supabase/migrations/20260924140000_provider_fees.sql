-- What taking a card payment actually costs the instructor (MNY-02, D-198).
--
-- `fee_pence` already on a payment is the platform's own cut, which is nothing today. This is a
-- different number: what the payments provider keeps, around 1.5% and 20p, which comes out of the
-- money before it reaches the Business and is an allowable expense against it.
--
-- Null rather than zero when it is not known yet. The provider does not put its fee in the event
-- that says a payment succeeded, so it is fetched afterwards, and a fee of nothing and a fee
-- nobody has asked about yet are not the same thing in a set of books.
alter table public.payments
  add column provider_fee_pence integer check (provider_fee_pence is null or provider_fee_pence >= 0);

-- ---------------------------------------------------------------------------------------
-- system_set_provider_fee: filled in by the webhook once the provider has told us (R-11).
-- ---------------------------------------------------------------------------------------
create or replace function public.system_set_provider_fee(p_provider_ref text, p_fee_pence integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if p_provider_ref is null or trim(p_provider_ref) = '' then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "provider_ref"}';
  end if;
  if p_fee_pence is null or p_fee_pence < 0 then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "fee_pence"}';
  end if;

  select * into v_payment from public.payments
   where provider_ref = p_provider_ref and provider = 'stripe'
     for update;
  if v_payment.id is null then
    return jsonb_build_object('applied', false, 'reason', 'no_payment');
  end if;
  -- Told twice is told once: the fee does not change after the fact, and an event that arrives
  -- again must not rewrite the books.
  if v_payment.provider_fee_pence is not null then
    return jsonb_build_object('applied', false, 'reason', 'already_known');
  end if;
  if p_fee_pence > v_payment.amount_pence then
    raise exception 'VALIDATION_FAILED' using detail = '{"field": "fee_pence"}';
  end if;

  update public.payments set provider_fee_pence = p_fee_pence where id = v_payment.id;

  return jsonb_build_object('applied', true, 'payment_id', v_payment.id, 'fee_pence', p_fee_pence);
end;
$$;

revoke all on function public.system_set_provider_fee(text, integer) from public, anon, authenticated;
grant execute on function public.system_set_provider_fee(text, integer) to service_role;
