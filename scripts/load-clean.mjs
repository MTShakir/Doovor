// Puts back what a load run took (M6-05): every lesson it booked is cancelled, so the next run has
// somewhere to book and the diary is as it was. Each one is cancelled by the learner who booked it,
// with their own token, the way a person would.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const fixturesFile = path.resolve(import.meta.dirname, '..', 'load', 'fixtures.json');
if (!existsSync(fixturesFile)) {
  console.error('No load/fixtures.json. Nothing to put back.');
  process.exit(0);
}

const { supabaseUrl, publishableKey, learners, days } = JSON.parse(readFileSync(fixturesFile, 'utf8'));
const from = days[0];

async function ask(url, options = {}, token) {
  const response = await fetch(url, {
    ...options,
    headers: { apikey: publishableKey, 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${url} answered ${String(response.status)}: ${body.slice(0, 200)}`);
  return body === '' ? null : JSON.parse(body);
}

let cancelled = 0;
for (const learner of learners) {
  const booked = await ask(
    `${supabaseUrl}/rest/v1/bookings?select=id&learner_id=eq.${learner.id}&starts_at=gte.${from}&status=in.(confirmed,requested,pending_payment)`,
    {},
    learner.token,
  );
  for (const booking of booked) {
    await ask(
      `${supabaseUrl}/rest/v1/rpc/cancel_booking`,
      { method: 'POST', body: JSON.stringify({ p_booking_id: booking.id, p_reason: 'Load test' }) },
      learner.token,
    );
    cancelled += 1;
  }
}

console.log(`Cancelled ${String(cancelled)} lessons booked from ${from}.`);
