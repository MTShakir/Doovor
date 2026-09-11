/**
 * Seed demo data (M0-28, M0-29). Run with `pnpm db:reset` (fresh database) or `pnpm db:seed`.
 * Refuses production, and any non-local target unless run with --allow-remote (seed/guard.ts).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { addDaysToLocalDate, isoWeekday, utcToLocal } from '@repo/core/time';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { totp } from '../src/testing/totp';
import { generateBookings, type SeedBooking } from './bookings';
import { businesses, catalogue, instructors, SEED_PASSWORD, seedPeople } from './data';
import { assertSeedTargets } from './guard';
import fixture from './fixtures/postcodes.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, '../../..');
const envFile = path.join(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

const supabaseUrl = required('NEXT_PUBLIC_SUPABASE_URL');
const secretKey = required('SUPABASE_SECRET_KEY');
const publishableKey = required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
const dbUrl = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
// Hosted projects need their own password (seed/guard.ts); locally the documented one is fine.
const password = process.env.SEED_PASSWORD ?? SEED_PASSWORD;

async function main(): Promise<void> {
  assertSeedTargets(
    [
      { label: 'Supabase URL', url: supabaseUrl },
      { label: 'database URL', url: dbUrl },
    ],
    {
      appEnv: process.env.APP_ENV,
      allowRemote: process.argv.includes('--allow-remote'),
      customPassword: Boolean(process.env.SEED_PASSWORD),
    },
  );
  const today = utcToLocal(new Date()).date;
  const people = seedPeople(today);
  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. People, through the official admin API (passwords hashed by Supabase Auth).
  const ids = new Map<string, string>();
  for (const person of people) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
      ...(person.phone ? { phone: person.phone, phone_confirm: true } : {}),
      user_metadata: { full_name: person.fullName, ...(person.intendedRole ? { intended_role: person.intendedRole } : {}) },
    });
    if (error) {
      throw new Error(`Could not create ${person.email}: ${error.message}. Seed a fresh database with pnpm db:reset.`);
    }
    ids.set(person.key, data.user.id);
  }
  const id = (key: string): string => {
    const value = ids.get(key);
    if (!value) throw new Error(`Unknown seed person ${key}`);
    return value;
  };

  // 2. Everything else in one transaction.
  const sql = postgres(dbUrl, { max: 1, onnotice: () => undefined });
  const bookings = generateBookings(instructors, today, { blockedDates: { tom: [addDaysToLocalDate(today, 6)] } });
  try {
    await sql.begin(async (tx) => {
      for (const p of fixture.postcodes) {
        await tx`insert into public.postcodes (postcode, outcode, area, latitude, longitude, admin_district, region, country)
                 values (${p.postcode}, ${p.outcode}, ${p.area}, ${p.latitude}, ${p.longitude}, ${p.admin_district}, ${p.region}, ${p.country})
                 on conflict (postcode) do nothing`;
      }

      await tx`insert into public.platform_staff (user_id, role) values (${id('admin')}, 'super_admin'), (${id('support')}, 'support_admin')`;

      const businessIds = new Map<string, string>();
      for (const b of businesses) {
        const [row] = await tx<{ id: string }[]>`
          insert into public.businesses (type, name, slug, base_postcode, base_location, address, plan, plan_expires_at, founding_offer, created_by)
          values (${b.type}, ${b.name}, ${b.slug}, ${b.postcode},
                  (select location from public.postcodes where postcode = ${b.postcode}),
                  ${tx.json({ line1: b.name, town: b.town, postcode: b.postcode })},
                  ${b.plan}, now() + interval '12 months', true, ${id(b.owner)})
          returning id`;
        if (!row) throw new Error(`Business ${b.name} was not created`);
        businessIds.set(b.key, row.id);
        await tx`insert into public.memberships (business_id, user_id, role) values (${row.id}, ${id(b.owner)}, 'owner')`;
        if (b.manager) await tx`insert into public.memberships (business_id, user_id, role) values (${row.id}, ${id(b.manager)}, 'manager')`;
      }
      const businessId = (key: string): string => {
        const value = businessIds.get(key);
        if (!value) throw new Error(`Unknown seed business ${key}`);
        return value;
      };

      // Lesson catalogue.
      const standardType = new Map<string, string>();
      for (const [businessKey, entry] of Object.entries(catalogue)) {
        for (const [index, lessonType] of entry.lessonTypes.entries()) {
          const [row] = await tx<{ id: string }[]>`
            insert into public.lesson_types (business_id, kind, name, sort_order)
            values (${businessId(businessKey)}, ${lessonType.kind}, ${lessonType.name}, ${index}) returning id`;
          if (!row) throw new Error('Lesson type was not created');
          if (lessonType.kind === 'standard') standardType.set(businessKey, row.id);
          for (const [minutes, pence] of lessonType.prices) {
            await tx`insert into public.lesson_prices (business_id, lesson_type_id, duration_minutes, price_pence)
                     values (${businessId(businessKey)}, ${row.id}, ${minutes}, ${pence})`;
          }
        }
        for (const pack of entry.packages) {
          await tx`insert into public.packages (business_id, name, minutes, price_pence, expiry_days)
                   values (${businessId(businessKey)}, ${pack.name}, ${pack.minutes}, ${pack.pricePence}, 365)`;
        }
      }

      // Instructors, their hours and one exception each for two of them.
      const instructorIds = new Map<string, string>();
      for (const i of instructors) {
        const biz = businessId(i.business);
        if (i.business === 'school') await tx`insert into public.memberships (business_id, user_id, role) values (${biz}, ${id(i.key)}, 'instructor')`;
        const [row] = await tx<{ id: string }[]>`
          insert into public.instructor_profiles (
            user_id, business_id, display_name, bio, languages, years_teaching, qualification, badge_number, badge_expiry,
            dbs_confirmed_at, verification_status, verified_at, transmission, car_make, car_model, specialisms,
            base_postcode, base_location, buffer_minutes, public_slug, supervisor_business_id
          ) values (
            ${id(i.key)}, ${biz}, ${i.displayName}, ${i.bio}, ${i.languages}, ${i.yearsTeaching}, ${i.qualification},
            ${i.badgeNumber}, ${addDaysToLocalDate(today, i.badgeExpiresInDays)}, now(), ${i.verification},
            ${i.verification === 'approved' ? new Date() : null}, ${i.transmission}, ${i.car[0]}, ${i.car[1]}, ${i.specialisms},
            ${businesses.find((b) => b.key === i.business)?.postcode ?? null},
            (select base_location from public.businesses where id = ${biz}), ${i.bufferMinutes}, ${i.slug},
            ${i.qualification === 'pdi' ? businessId('school') : null}
          ) returning id`;
        if (!row) throw new Error(`Instructor ${i.displayName} was not created`);
        instructorIds.set(i.key, row.id);
        for (const h of i.hours) {
          await tx`insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
                   values (${row.id}, ${biz}, ${h.weekday}, ${h.start}, ${h.end})`;
        }
      }
      const instructorId = (key: string): string => {
        const value = instructorIds.get(key);
        if (!value) throw new Error(`Unknown seed instructor ${key}`);
        return value;
      };

      const carServiceDay = addDaysToLocalDate(today, 6);
      await tx`insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason, created_by)
               values (${instructorId('tom')}, ${businessId('school')}, 'blocked',
                       (${carServiceDay}::date::timestamp at time zone 'Europe/London'),
                       ((${carServiceDay}::date + 1)::timestamp at time zone 'Europe/London'), 'Car service', ${id('tom')})`;
      const tenDaysOut = addDaysToLocalDate(today, 10);
      const extraSunday = addDaysToLocalDate(tenDaysOut, (7 - isoWeekday(tenDaysOut)) % 7);
      await tx`insert into public.availability_exceptions (instructor_id, business_id, kind, starts_at, ends_at, reason, created_by)
               values (${instructorId('sarah')}, ${businessId('sarahBiz')}, 'open',
                       ((${extraSunday}::date + time '10:00') at time zone 'Europe/London'),
                       ((${extraSunday}::date + time '13:00') at time zone 'Europe/London'), 'Extra Sunday lessons', ${id('sarah')})`;

      // Learners: profiles, private details, relationships and a home pickup point.
      for (const person of people.filter((p) => p.learner)) {
        const l = person.learner;
        if (!l) continue;
        const place = fixture.postcodes.find((p) => p.postcode === l.postcode);
        await tx`insert into public.learner_profiles (user_id, postcode, location, transmission, experience_level, provisional_licence_confirmed)
                 values (${id(person.key)}, ${l.postcode}, (select location from public.postcodes where postcode = ${l.postcode}),
                         ${l.transmission}, ${l.experience}, true)`;
        await tx`insert into public.learner_private (user_id, date_of_birth) values (${id(person.key)}, ${l.dateOfBirth})`;
        await tx`insert into public.pickup_points (learner_id, kind, label, address, postcode, location, is_default, created_by)
                 values (${id(person.key)}, 'home', 'Home', ${`${place?.ward ?? ''}, ${place?.admin_district ?? ''}`}, ${l.postcode},
                         (select location from public.postcodes where postcode = ${l.postcode}), true, ${id(person.key)})`;
      }
      for (const i of instructors) {
        for (const learner of i.learners) {
          await tx`insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source, usual_duration_minutes, created_by)
                   values (${businessId(i.business)}, ${id(learner.key)}, ${instructorId(i.key)}, ${learner.status}, 'invite',
                           ${learner.usualMinutes}, ${id(i.key)})`;
        }
      }

      // Lessons.
      for (const b of bookings) {
        const instructor = instructors.find((i) => i.key === b.instructorKey);
        if (!instructor) continue;
        await insertBooking(tx, b, {
          businessId: businessId(instructor.business),
          instructorId: instructorId(b.instructorKey),
          learnerId: id(b.learnerKey),
          lessonTypeId: standardType.get(instructor.business) ?? '',
          createdBy: id(b.instructorKey),
          bufferMinutes: instructor.bufferMinutes,
          pricePence: priceFor(instructor.business, b.durationMinutes),
        });
      }
    });
  } finally {
    await sql.end();
  }

  // 3. Two-step verification for staff and the school owner, through Supabase's own MFA API.
  const secrets: Record<string, string> = {};
  for (const person of people.filter((p) => p.totp)) {
    secrets[person.email] = await enrolTotp(person.email);
  }
  const authDir = path.join(root, 'e2e', '.auth');
  mkdirSync(authDir, { recursive: true });
  writeFileSync(
    path.join(authDir, 'seed-accounts.json'),
    `${JSON.stringify({ password, totpSecrets: secrets }, null, 2)}\n`,
  );

  printSummary(people, bookings.length);
}

function priceFor(business: 'sarahBiz' | 'school', minutes: number): number {
  const standard = catalogue[business].lessonTypes.find((t) => t.kind === 'standard');
  return standard?.prices.find(([m]) => m === minutes)?.[1] ?? 0;
}

async function insertBooking(
  tx: postgres.TransactionSql,
  b: SeedBooking,
  ctx: { businessId: string; instructorId: string; learnerId: string; lessonTypeId: string; createdBy: string; bufferMinutes: number; pricePence: number },
): Promise<void> {
  const cancelled = b.status === 'cancelled';
  await tx`
    insert into public.bookings (
      business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at, buffer_minutes, status, payment_status,
      payment_mode, price_pence, source, expires_at, created_by, cancelled_by, cancelled_at, cancel_reason, late_cancellation, fee_pence
    ) values (
      ${ctx.businessId}, ${ctx.instructorId}, ${ctx.learnerId}, ${ctx.lessonTypeId}, ${b.startsAt}, ${b.endsAt}, ${ctx.bufferMinutes},
      ${b.status}, ${b.paymentStatus}, 'offline', ${ctx.pricePence}, 'instructor',
      ${b.status === 'requested' ? new Date(Date.now() + 12 * 3600_000) : null}, ${ctx.createdBy},
      ${cancelled ? ctx.learnerId : null}, ${cancelled ? new Date(b.startsAt.getTime() - 20 * 3600_000) : null},
      ${cancelled ? 'Feeling unwell' : null}, ${cancelled ? true : null}, ${cancelled ? ctx.pricePence : null}
    )`;
}

async function enrolTotp(email: string): Promise<string> {
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`Could not sign in ${email}: ${signIn.error.message}`);
  const enrol = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Seed authenticator' });
  if (enrol.error) throw new Error(`Could not enrol ${email} in TOTP: ${enrol.error.message}`);
  const verify = await client.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: totp(enrol.data.totp.secret) });
  if (verify.error) throw new Error(`Could not verify TOTP for ${email}: ${verify.error.message}`);
  await client.auth.signOut();
  return enrol.data.totp.secret;
}

function printSummary(people: ReturnType<typeof seedPeople>, bookingCount: number): void {
  const role = (key: string): string =>
    ({ admin: 'Super Admin', support: 'Support Admin', sarah: 'Independent instructor, Leeds', david: 'School owner, Manchester', lucy: 'School manager' })[key] ??
    (instructors.some((i) => i.key === key) ? 'School instructor' : 'Learner');
  const lines = [
    `\nSeeded accounts (password for all: ${process.env.SEED_PASSWORD ? 'the SEED_PASSWORD you set' : password})\n`,
    ...people.map((person) => `  ${person.email.padEnd(28)} ${role(person.key)}${person.totp ? ' (TOTP)' : ''}`),
    `\n  ${String(bookingCount)} lessons across 5 days back and 14 days ahead.`,
    '  TOTP secrets for seeded staff: e2e/.auth/seed-accounts.json\n',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
