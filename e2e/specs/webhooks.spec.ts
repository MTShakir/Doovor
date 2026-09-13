import { expect, test } from '@playwright/test';
import { countProviderEvents } from '../support/database';

/**
 * The webhook route (R-11, M3-03), through the real server: the signature is checked on the
 * raw body, and the same delivery arriving more than once has its effect exactly once.
 *
 * The fake provider signs the way the real one does as far as this route is concerned: a
 * header that either matches the body and the secret, or does not.
 */
test.describe('events from the payments provider (R-11, M3-03)', () => {
  const endpoint = '/api/webhooks/stripe';

  /** The fake's signature, which is the one the app checks while it is the provider in use. */
  const sign = (body: string, secret = 'whsec_local_fake'): string => {
    let hash = 5381;
    for (const character of `${secret}.${body}`) {
      hash = ((hash << 5) + hash + (character.codePointAt(0) ?? 0)) % 0xffffffff;
    }
    return `fake_sig_${hash.toString(16)}`;
  };

  const event = (id: string, type = 'payment_intent.succeeded'): string =>
    JSON.stringify({
      id,
      type,
      account: 'acct_events_e2e',
      created: 1_789_000_000,
      data: { object: { id: 'pi_e2e', amount: 4200 } },
    });

  test('refuses a body whose signature is not ours @desktop-only', async ({ request }) => {
    const body = event('evt_forged');

    const noSignature = await request.post(endpoint, { data: body, headers: { 'content-type': 'application/json' } });
    expect(noSignature.status(), 'no signature at all').toBe(400);

    const forged = await request.post(endpoint, {
      data: body,
      headers: { 'content-type': 'application/json', 'stripe-signature': 'fake_sig_deadbeef' },
    });
    expect(forged.status(), 'a signature that is not ours').toBe(400);

    // A body changed after signing is a different body, and the signature no longer fits.
    const tampered = await request.post(endpoint, {
      data: event('evt_forged').replace('4200', '1'),
      headers: { 'content-type': 'application/json', 'stripe-signature': sign(body) },
    });
    expect(tampered.status(), 'a body that was changed after signing').toBe(400);

    expect(await countProviderEvents('evt_forged')).toBe(0);
  });

  test('takes the same event three times and records it once @desktop-only', async ({ request }) => {
    const id = `evt_e2e_${String(Date.now())}`;
    const body = event(id);
    const headers = { 'content-type': 'application/json', 'stripe-signature': sign(body) };

    const deliveries = await Promise.all([
      request.post(endpoint, { data: body, headers }),
      request.post(endpoint, { data: body, headers }),
      request.post(endpoint, { data: body, headers }),
    ]);

    for (const delivery of deliveries) expect(delivery.status(), 'every delivery is answered 200').toBe(200);

    const outcomes = await Promise.all(deliveries.map((one) => one.json() as Promise<{ outcome: string }>));
    expect(outcomes.filter((one) => one.outcome !== 'duplicate'), 'exactly one did the work').toHaveLength(1);
    expect(await countProviderEvents(id), 'and there is one row for it').toBe(1);
  });
});
