/**
 * Demo data for local development, CI and previews (M0-29). Fictional people and
 * businesses; postcodes are public places (fixtures/postcodes.json). Never production.
 */
import { addDaysToLocalDate } from '@repo/core/time';

export const SEED_PASSWORD = 'Password123!';

export type LearnerTransmission = 'manual' | 'automatic';
export type ExperienceLevel = 'none' | 'some' | 'test_booked';

export interface SeedPerson {
  key: string;
  fullName: string;
  email: string;
  intendedRole: 'learner' | 'instructor' | 'school' | null;
  /** Ofcom drama number, confirmed so seeded instructors skip phone verification. */
  phone?: string;
  /** Enrol in TOTP (staff and school owners, AUTH-08). */
  totp?: boolean;
  learner?: {
    dateOfBirth: string;
    postcode: string;
    transmission: LearnerTransmission;
    experience: ExperienceLevel;
  };
}

/** Someone aged 17 years and a few months on the seed date (R-16 under-18 cases). */
function seventeenYearsAgo(today: string): string {
  return addDaysToLocalDate(today, -(17 * 365 + 100));
}

export function seedPeople(today: string): SeedPerson[] {
  return [
    { key: 'admin', fullName: 'Sam Admin', email: 'admin@example.com', intendedRole: null, totp: true },
    { key: 'support', fullName: 'Priya Support', email: 'support@example.com', intendedRole: null, totp: true },
    { key: 'sarah', fullName: 'Sarah Khan', email: 'sarah.khan@example.com', intendedRole: 'instructor', phone: '+447700900001' },
    { key: 'david', fullName: 'David Okafor', email: 'david.okafor@example.com', intendedRole: 'school', totp: true },
    { key: 'lucy', fullName: 'Lucy Grant', email: 'lucy.grant@example.com', intendedRole: 'school' },
    { key: 'emma', fullName: 'Emma Clarke', email: 'emma.clarke@example.com', intendedRole: 'instructor', phone: '+447700900002' },
    { key: 'tom', fullName: 'Tom Walsh', email: 'tom.walsh@example.com', intendedRole: 'instructor', phone: '+447700900003' },
    { key: 'aisha', fullName: 'Aisha Rahman', email: 'aisha.rahman@example.com', intendedRole: 'instructor', phone: '+447700900004' },
    {
      key: 'jack', fullName: 'Jack Taylor', email: 'jack.taylor@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: '2004-03-14', postcode: 'LS2 9JT', transmission: 'manual', experience: 'some' },
    },
    {
      key: 'olivia', fullName: 'Olivia Brown', email: 'olivia.brown@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: seventeenYearsAgo(today), postcode: 'LS8 2HH', transmission: 'manual', experience: 'none' },
    },
    {
      key: 'noah', fullName: 'Noah Wilson', email: 'noah.wilson@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: '1998-11-02', postcode: 'LS11 0ES', transmission: 'manual', experience: 'test_booked' },
    },
    {
      key: 'amelia', fullName: 'Amelia Evans', email: 'amelia.evans@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: '2006-06-21', postcode: 'M13 9PL', transmission: 'automatic', experience: 'none' },
    },
    {
      key: 'harry', fullName: 'Harry Thomas', email: 'harry.thomas@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: seventeenYearsAgo(today), postcode: 'M16 0RA', transmission: 'manual', experience: 'some' },
    },
    {
      key: 'isla', fullName: 'Isla Roberts', email: 'isla.roberts@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: '2001-01-30', postcode: 'M11 3FF', transmission: 'automatic', experience: 'some' },
    },
    {
      key: 'leo', fullName: 'Leo Johnson', email: 'leo.johnson@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: '2007-08-09', postcode: 'M50 2EQ', transmission: 'manual', experience: 'none' },
    },
    {
      key: 'mia', fullName: 'Mia Walker', email: 'mia.walker@example.com', intendedRole: 'learner',
      learner: { dateOfBirth: '1995-04-17', postcode: 'M15 4FN', transmission: 'manual', experience: 'test_booked' },
    },
  ];
}

export interface SeedBusiness {
  key: 'sarahBiz' | 'school';
  type: 'independent' | 'school';
  name: string;
  slug: string;
  postcode: string;
  town: string;
  plan: 'pro' | 'school';
  owner: string;
  manager?: string;
}

export const businesses: SeedBusiness[] = [
  { key: 'sarahBiz', type: 'independent', name: 'Sarah Khan Driving', slug: 'sarah-khan-driving', postcode: 'LS6 3QS', town: 'Leeds', plan: 'pro', owner: 'sarah' },
  { key: 'school', type: 'school', name: 'Quayside Driving School', slug: 'quayside-driving-school', postcode: 'M1 2QF', town: 'Manchester', plan: 'school', owner: 'david', manager: 'lucy' },
];

export interface SeedHours {
  weekday: number;
  start: string;
  end: string;
}

export interface SeedInstructor {
  key: string;
  business: SeedBusiness['key'];
  displayName: string;
  slug: string;
  bio: string;
  languages: string[];
  yearsTeaching: number;
  qualification: 'adi' | 'pdi';
  badgeNumber: string;
  /** Days from the seed date. Emma's expires in 45 days to exercise badge reminders (INS-03). */
  badgeExpiresInDays: number;
  verification: 'approved' | 'pending';
  transmission: 'manual' | 'automatic' | 'both';
  car: [make: string, model: string];
  specialisms: string[];
  bufferMinutes: number;
  hours: SeedHours[];
  learners: { key: string; usualMinutes: number; status: 'active' | 'test_booked' }[];
}

const weekdays = (days: number[], start: string, end: string): SeedHours[] => days.map((weekday) => ({ weekday, start, end }));

export const instructors: SeedInstructor[] = [
  {
    key: 'sarah', business: 'sarahBiz', displayName: 'Sarah Khan', slug: 'sarah-khan',
    bio: 'Calm, patient instructor with 9 years of experience. Nervous drivers are very welcome.',
    languages: ['English', 'Urdu'], yearsTeaching: 9, qualification: 'adi', badgeNumber: '416234', badgeExpiresInDays: 430,
    verification: 'approved', transmission: 'manual', car: ['Volkswagen', 'Polo'],
    specialisms: ['nervous_drivers', 'test_prep', 'motorway'], bufferMinutes: 30,
    hours: [...weekdays([1, 2, 3, 4, 5], '08:00', '18:00'), { weekday: 6, start: '09:00', end: '13:00' }],
    learners: [
      { key: 'jack', usualMinutes: 60, status: 'active' },
      { key: 'olivia', usualMinutes: 90, status: 'active' },
      { key: 'noah', usualMinutes: 120, status: 'test_booked' },
    ],
  },
  {
    key: 'emma', business: 'school', displayName: 'Emma Clarke', slug: 'emma-clarke',
    bio: 'Automatic specialist. Friendly, clear and great with refresher lessons.',
    languages: ['English'], yearsTeaching: 6, qualification: 'adi', badgeNumber: '527345', badgeExpiresInDays: 45,
    verification: 'approved', transmission: 'automatic', car: ['Toyota', 'Yaris Hybrid'],
    specialisms: ['nervous_drivers', 'refresher'], bufferMinutes: 30,
    hours: weekdays([1, 2, 3, 4, 5], '09:00', '17:00'),
    learners: [
      { key: 'amelia', usualMinutes: 60, status: 'active' },
      { key: 'isla', usualMinutes: 90, status: 'active' },
    ],
  },
  {
    key: 'tom', business: 'school', displayName: 'Tom Walsh', slug: 'tom-walsh',
    bio: 'Intensive courses and motorway lessons. Pass Plus registered.',
    languages: ['English', 'Polish'], yearsTeaching: 12, qualification: 'adi', badgeNumber: '638456', badgeExpiresInDays: 700,
    verification: 'approved', transmission: 'manual', car: ['Ford', 'Fiesta'],
    specialisms: ['intensive_courses', 'pass_plus', 'motorway'], bufferMinutes: 30,
    hours: weekdays([2, 3, 4, 5, 6], '08:00', '16:00'),
    learners: [
      { key: 'harry', usualMinutes: 90, status: 'active' },
      { key: 'mia', usualMinutes: 120, status: 'test_booked' },
    ],
  },
  {
    key: 'aisha', business: 'school', displayName: 'Aisha Rahman', slug: 'aisha-rahman',
    bio: 'Trainee instructor supervised by Quayside Driving School.',
    languages: ['English', 'Bengali'], yearsTeaching: 0, qualification: 'pdi', badgeNumber: '749567', badgeExpiresInDays: 180,
    verification: 'pending', transmission: 'manual', car: ['Vauxhall', 'Corsa'],
    specialisms: [], bufferMinutes: 30,
    hours: weekdays([1, 2, 3, 4], '10:00', '18:00'),
    learners: [{ key: 'leo', usualMinutes: 60, status: 'active' }],
  },
];

export interface SeedLessonType {
  kind: 'standard' | 'test_prep' | 'mock_test' | 'motorway' | 'intensive' | 'test_day';
  name: string;
  /** [duration in minutes, price in pence] */
  prices: [number, number][];
}

export const catalogue: Record<SeedBusiness['key'], { lessonTypes: SeedLessonType[]; packages: { name: string; minutes: number; pricePence: number }[] }> = {
  sarahBiz: {
    lessonTypes: [
      { kind: 'standard', name: 'Standard lesson', prices: [[60, 4200], [90, 6200], [120, 8200]] },
      { kind: 'motorway', name: 'Motorway lesson', prices: [[120, 9000]] },
      { kind: 'test_day', name: 'Test day', prices: [[120, 12000]] },
    ],
    packages: [{ name: '10 hours', minutes: 600, pricePence: 40000 }],
  },
  school: {
    lessonTypes: [
      { kind: 'standard', name: 'Standard lesson', prices: [[60, 4000], [90, 6000], [120, 8000]] },
      { kind: 'mock_test', name: 'Mock test', prices: [[60, 4500]] },
      { kind: 'intensive', name: 'Intensive block', prices: [[240, 16000]] },
      { kind: 'test_day', name: 'Test day', prices: [[120, 11500]] },
    ],
    packages: [
      { name: '10 hours', minutes: 600, pricePence: 38000 },
      { name: '5 hours', minutes: 300, pricePence: 19500 },
    ],
  },
};
