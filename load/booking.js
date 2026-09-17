// Booking under load (M6-05, NFR-PERF-02, PRD 10.1): a learner reads the open times for a day and
// takes one, the way the booking page does, with enough of them at once that two go for the same
// slot. One of them is told the slot is taken, which is the right answer and not a failure: the
// threshold is on how long a booking takes, not on winning the race.
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
const noSlots = new Counter('bookings_no_slot_free');
const bookingTime = new Trend('write_create_booking', true);
const slotsTime = new Trend('read_open_slots_signed_in', true);

export const options = {
  scenarios: {
    booking: {
      executor: 'ramping-vus',
      startVUs: 2,
      stages: [
        { duration: '20s', target: 6 },
        { duration: '40s', target: 12 },
        { duration: '20s', target: 2 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // NFR-PERF-02: a booking is written in under 600 ms for 95 of every 100 people.
    'http_req_duration{kind:write}': ['p(95)<600'],
    'http_req_duration{kind:read}': ['p(95)<300'],
    // A refused booking is still an answer; what must not happen is the server failing to give one.
    'http_req_failed{kind:write}': ['rate<0.01'],
    checks: ['rate>0.99'],
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

  const slotWasTaken = answer.status === 400 && answer.body.indexOf('SLOT_TAKEN') !== -1;
  if (slotWasTaken) taken.add(1);
  else if (answer.status === 200) booked.add(1);

  check(answer, { 'the booking was made, or the slot had gone': (r) => r.status === 200 || slotWasTaken });
}
