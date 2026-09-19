// Booking under load (M6-05, NFR-PERF-02, PRD 10.1): a learner reads the open times for a day and
// takes one, the way the booking page does, with enough of them at once that two go for the same
// slot. One of them is told the slot is taken, which is the right answer and not a failure: the
// threshold is on how long a booking takes, not on winning the race.
//
// A fixed number of bookings rather than a fixed length of time, because what it books is finite
// twice over: a diary only has so many free hours in it, and one account may book 120 lessons an
// hour and no more (D-137). A run that outlasts either one stops measuring bookings and starts
// measuring refusals, which is what the first one in CI did (D-139).
//
// Bookings are made from three weeks out, past the seeded lessons and the days the end to end tests
// use, and inside the eight weeks a Business takes bookings for. `pnpm load:clean` cancels them
// afterwards, so the next run has somewhere to book.
import { check, fail } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

const fixtures = JSON.parse(open('./fixtures.json'));
const { supabaseUrl, publishableKey, learners } = fixtures;

const booked = new Counter('bookings_made');
const taken = new Counter('bookings_slot_taken');
const limited = new Counter('bookings_rate_limited');
const noSlots = new Counter('bookings_no_slot_free');
const bookingTime = new Trend('write_create_booking', true);
const slotsTime = new Trend('read_open_slots_signed_in', true);

/** Well inside both ceilings, and still enough bookings to say what p95 is. */
const bookings = 200;

export const options = {
  scenarios: {
    booking: {
      executor: 'shared-iterations',
      vus: 12,
      iterations: bookings,
      maxDuration: '3m',
    },
  },
  thresholds: {
    // NFR-PERF-02: a booking is written in under 600 ms for 95 of every 100 people.
    'http_req_duration{kind:write}': ['p(95)<600'],
    'http_req_duration{kind:read}': ['p(95)<300'],
    // A booking refused because the slot has gone answers 400, so counting non-2xx answers as
    // failures would count the race this test exists to create. What must hold is that every answer
    // is one of the answers we mean, and that most rounds really did book something.
    checks: ['rate>0.99'],
    bookings_made: [`count>${String(Math.floor(bookings * 0.6))}`],
  },
};

const anyOf = (list) => list[Math.floor(Math.random() * list.length)];

export function setup() {
  if (learners.length === 0) fail('No learners in load/fixtures.json. Run pnpm db:seed, then pnpm load.');
  return {};
}

export default function book() {
  // One account for each running copy, so no account meets its own hourly limit (D-137).
  const learner = learners[(__VU - 1) % learners.length];
  const headers = { apikey: publishableKey, 'content-type': 'application/json', authorization: `Bearer ${learner.token}` };
  // Only the days that instructor works: a load test of a closed diary measures nothing.
  const day = anyOf(learner.days);

  const slots = http.post(
    `${supabaseUrl}/rest/v1/rpc/open_slots`,
    JSON.stringify({ p_instructor_id: learner.instructorId, p_date: day, p_duration_minutes: learner.durationMinutes }),
    { headers, tags: { kind: 'read', name: 'open_slots' } },
  );
  slotsTime.add(slots.timings.duration);
  if (!check(slots, { 'the open times answered': (r) => r.status === 200 })) return;

  const free = slots.json();
  if (!Array.isArray(free) || free.length === 0) {
    noSlots.add(1);
    return;
  }

  const answer = http.post(
    `${supabaseUrl}/rest/v1/rpc/create_booking`,
    JSON.stringify({
      p_instructor_id: learner.instructorId,
      p_learner_id: learner.id,
      p_lesson_type_id: learner.lessonTypeId,
      p_starts_at: anyOf(free),
      p_duration_minutes: learner.durationMinutes,
    }),
    { headers, tags: { kind: 'write', name: 'create_booking' } },
  );
  bookingTime.add(answer.timings.duration);

  const refused = (code) => answer.status >= 400 && answer.body.indexOf(code) !== -1;
  const slotWasTaken = refused('SLOT_TAKEN');
  const rateLimited = refused('RATE_LIMITED');
  if (answer.status === 200) booked.add(1);
  else if (slotWasTaken) taken.add(1);
  else if (rateLimited) limited.add(1);

  check(answer, {
    'the booking was made, or the slot had gone, or the account had booked its fill': (r) => r.status === 200 || slotWasTaken || rateLimited,
  });
}
