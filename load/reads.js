// The reads a busy evening is made of (M6-05, NFR-PERF-02): a learner looking at a city page, a
// profile, a booking link, and the times they could take. Each one is the same call the app makes,
// so a slow policy or a missing index shows here before it shows to somebody.
//
// The threshold is the requirement: p95 under 300 ms. Run it with `pnpm load`, which builds
// load/fixtures.json first.
//
// What the load is set to, and why it came down (D-207). CI runs k6, Postgres, PostgREST and the
// production build of the app on one two core runner. Past a dozen or so at once that runner is
// the slowest thing in the measurement, and the number stops being about the product: the same
// commit passed at 261 ms one day and failed at 438 ms the next, untouched, while the prerendered
// page it also measures went from 30 ms to 49 ms and the fastest single slot read of the run went
// from 8 ms to 32 ms. Neither of those can be explained by anything in this repository.
//
// So the peak is twelve, which is what load/booking.js has always used against the same threshold
// on the same runner without once crossing it. At twelve the runner is not the bottleneck and the
// number is about the query again, which is what this is for: a slow policy or a missing index
// still fails the build, and the weather no longer does.
import { check, fail } from 'k6';
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const fixtures = JSON.parse(open('./fixtures.json'));
const { supabaseUrl, publishableKey, appUrl, publicPages, instructors, days } = fixtures;

/** One trend for each read, so a slow one is named rather than hidden in the average. */
const timings = {
  city_page: new Trend('read_city_page', true),
  instructor_profile_page: new Trend('read_instructor_profile_page', true),
  booking_page: new Trend('read_booking_page', true),
  open_slots: new Trend('read_open_slots', true),
  next_open_slots: new Trend('read_next_open_slots', true),
  public_page: new Trend('read_public_page', true),
};

export const options = {
  scenarios: {
    // Half a minute of steady traffic, then a minute of more than twice as much, then away again.
    reads: {
      executor: 'ramping-vus',
      startVUs: 3,
      stages: [
        { duration: '30s', target: 5 },
        { duration: '60s', target: 12 },
        { duration: '30s', target: 3 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    // NFR-PERF-02: reads answer in under 300 ms for 95 of every 100 people.
    'http_req_duration{kind:read}': ['p(95)<300'],
    'http_req_failed{kind:read}': ['rate<0.01'],
    // A whole page is a different measurement, and its own requirement is NFR-PERF-01, which
    // Lighthouse holds. This one only says a prerendered page stays quick while the site is busy.
    'http_req_duration{kind:page}': ['p(95)<1000'],
    'http_req_failed{kind:page}': ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

const anyOf = (list) => list[Math.floor(Math.random() * list.length)];

function rpc(name, body) {
  const response = http.post(`${supabaseUrl}/rest/v1/rpc/${name}`, JSON.stringify(body), {
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    tags: { kind: 'read', name },
  });
  timings[name].add(response.timings.duration);
  check(response, { [`${name} answered`]: (r) => r.status === 200 });
  return response;
}

export function setup() {
  if (instructors.length === 0) fail('No instructors in load/fixtures.json. Run pnpm db:seed, then pnpm load.');
  return {};
}

export default function reads() {
  const instructor = anyOf(instructors);

  // The city page a learner lands on, and the profile they open from it.
  rpc('city_page', { p_city: instructor.citySlug ?? 'leeds' });
  rpc('instructor_profile_page', { p_slug: instructor.slug });
  rpc('next_open_slots', { p_instructor_id: instructor.id, p_duration_minutes: instructor.durationMinutes });

  // The booking link, and the day they pick.
  rpc('booking_page', { p_slug: instructor.slug });
  rpc('open_slots', { p_instructor_id: instructor.id, p_date: anyOf(days), p_duration_minutes: instructor.durationMinutes });

  // And the page itself, rendered and cached the way a visitor gets it.
  const page = http.get(`${appUrl}${anyOf(publicPages)}`, { tags: { kind: 'page', name: 'public_page' } });
  timings.public_page.add(page.timings.duration);
  check(page, { 'the page answered': (r) => r.status === 200 });
}
