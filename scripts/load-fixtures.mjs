// What the load tests need to be about something real (M6-05, NFR-PERF-02): the pages the sitemap
// lists, the instructors a learner can actually book, the days those instructors work, and a token
// for each of them. Written to load/fixtures.json, which k6 reads as it starts.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { appUrl, publishableKey, root, rpc, rest, seedPassword, signIn, supabaseUrl } from './load-supabase.mjs';

const password = seedPassword();

/** The learners the write scenario books as: one each, so no account meets its own hourly limit (D-137). */
const learnerEmails = [
  'jack.taylor@example.com',
  'olivia.brown@example.com',
  'noah.wilson@example.com',
  'harry.thomas@example.com',
  'leo.johnson@example.com',
  'mia.walker@example.com',
  'chloe.bennett@example.com',
  'omar.iqbal@example.com',
];

// The public pages, as the sitemaps list them: whatever the seed put there, never a guess.
const entries = await rpc('sitemap_entries', {});
const placePath = (place) =>
  `/driving-lessons/${place.citySlug}${place.areaSlug ? `/${place.areaSlug}` : ''}${place.automatic ? '/automatic' : ''}`;
const publicPages = [
  ...new Set([
    '/',
    '/learners',
    '/pricing',
    ...entries.places.slice(0, 8).map(placePath),
    ...entries.instructors.slice(0, 6).map((one) => `/instructors/${one.citySlug ?? 'leeds'}/${one.slug}`),
    ...entries.schools.slice(0, 3).map((one) => `/schools/${one.citySlug ?? 'leeds'}/${one.slug}`),
  ]),
];

// Every instructor who takes bookings, with the lesson a learner would pick.
const instructors = [];
for (const one of entries.instructors) {
  const page = await rpc('booking_page', { p_slug: one.slug });
  if (page === null || page.lessons.length === 0) continue;
  const lesson = page.lessons[0];
  instructors.push({
    slug: one.slug,
    citySlug: one.citySlug,
    id: page.instructorId,
    lessonTypeId: lesson.lessonTypeId,
    durationMinutes: lesson.durationMinutes,
  });
}
if (instructors.length === 0) throw new Error('No instructor takes bookings. Run pnpm db:seed.');

// A learner, their token, the instructor they are already allowed to book with, and a lesson that
// Business charges for: create_booking refuses a length with no price.
const learners = [];
for (const email of learnerEmails) {
  const who = await signIn(email, password);
  const [relationship] = await rest(
    `learner_relationships?select=instructor_id,business_id&status=eq.active&learner_id=eq.${who.id}&limit=1`,
    who.token,
  );
  if (!relationship) continue;
  const [price] = await rest(
    `lesson_prices?business_id=eq.${relationship.business_id}&select=lesson_type_id,duration_minutes&order=duration_minutes&limit=1`,
    who.token,
  );
  if (!price) continue;
  learners.push({
    email,
    id: who.id,
    token: who.token,
    instructorId: relationship.instructor_id,
    lessonTypeId: price.lesson_type_id,
    durationMinutes: price.duration_minutes,
  });
}
if (learners.length === 0) throw new Error('No seeded learner can book. Run pnpm db:seed.');

// Past the seeded lessons and the days the end to end tests use, and inside the eight weeks a
// Business takes bookings for by default: nothing can be booked beyond that (D-139).
const firstDay = 18;
const days = Array.from({ length: 36 }, (_, index) => {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + firstDay + index);
  return day.toISOString().slice(0, 10);
});

// The days their instructor actually works, so a booking round books rather than finding a closed
// day: a load test of an empty diary measures nothing.
for (const learner of learners) {
  const open = [];
  for (const day of days) {
    const slots = await rpc(
      'open_slots',
      { p_instructor_id: learner.instructorId, p_date: day, p_duration_minutes: learner.durationMinutes },
      learner.token,
    );
    if (slots.length >= 3) open.push(day);
  }
  learner.days = open;
}
const bookable = learners.filter((learner) => learner.days.length > 0);
if (bookable.length === 0) throw new Error('No learner has an instructor with an open day. Run pnpm db:seed.');

const fixtures = { supabaseUrl, publishableKey, appUrl, publicPages, instructors, learners: bookable, days };
mkdirSync(path.join(root, 'load'), { recursive: true });
writeFileSync(path.join(root, 'load', 'fixtures.json'), `${JSON.stringify(fixtures, null, 2)}\n`);

console.log(
  `load/fixtures.json: ${String(publicPages.length)} public pages, ${String(instructors.length)} instructors, ` +
    `${String(bookable.length)} learners with ${bookable.map((learner) => String(learner.days.length)).join(', ')} open days ` +
    `of ${String(days.length)} from day ${String(firstDay)}.`,
);
