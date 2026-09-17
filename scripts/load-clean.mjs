// Puts back what a load run took (M6-05): every lesson it booked is cancelled, so the next run has
// somewhere to book and the diary is as it was. Each one is cancelled by the learner who booked it,
// signed in again here, because the token in the fixtures file only lasts an hour.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { rest, root, rpc, seedPassword, signIn } from './load-supabase.mjs';

const fixturesFile = path.join(root, 'load', 'fixtures.json');
if (!existsSync(fixturesFile)) {
  console.error('No load/fixtures.json. Nothing to put back.');
  process.exit(0);
}

const { learners, days } = JSON.parse(readFileSync(fixturesFile, 'utf8'));
const from = days[0];
const password = seedPassword();

let cancelled = 0;
for (const learner of learners) {
  const who = await signIn(learner.email, password);
  const booked = await rest(
    `bookings?select=id&learner_id=eq.${who.id}&starts_at=gte.${from}&status=in.(confirmed,requested,pending_payment)`,
    who.token,
  );
  for (const booking of booked) {
    await rpc('cancel_booking', { p_booking_id: booking.id, p_reason: 'Load test' }, who.token);
    cancelled += 1;
  }
}

console.log(`Cancelled ${String(cancelled)} lessons booked from ${from}.`);
