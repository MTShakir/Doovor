import { describe, expect, it } from 'vitest';
import { instructorShareCard, placeShareCard, schoolShareCard, shareCardVersion, siteShareCard } from './share-card';

const sarah = {
  name: 'Sarah Khan',
  qualification: 'adi',
  transmission: 'manual',
  cityName: 'Leeds',
  hourlyFromPence: 4200,
  takingBookings: true,
  photoUrl: null,
} as const;

describe('the image a shared page shows (PRD 14.6, M5-08)', () => {
  it('shows an instructor as their profile does: who, where, the facts first, and whether to book', () => {
    expect(instructorShareCard(sarah)).toEqual({
      eyebrow: 'Driving instructor in Leeds',
      title: 'Sarah Khan',
      facts: ['Approved driving instructor', 'Manual', 'From £42 an hour'],
      picture: { initials: 'SK', photoUrl: null, verified: true },
      action: 'Book a lesson',
      paused: false,
    });
    expect(
      instructorShareCard({
        ...sarah,
        name: 'Aisha Rahman',
        qualification: 'pdi',
        transmission: 'both',
        cityName: null,
        hourlyFromPence: 4250,
        takingBookings: false,
        photoUrl: 'https://example.com/a.webp',
      }),
    ).toEqual({
      eyebrow: 'Driving instructor',
      title: 'Aisha Rahman',
      facts: ['Trainee driving instructor', 'Manual and automatic', 'From £42.50 an hour'],
      picture: { initials: 'AR', photoUrl: 'https://example.com/a.webp', verified: true },
      action: 'Not taking new bookings',
      paused: true,
    });
    expect(instructorShareCard({ ...sarah, hourlyFromPence: null }).facts).toEqual(['Approved driving instructor', 'Manual']);
  });

  it('shows a school by its name, city and how many instructors a learner can choose from', () => {
    expect(schoolShareCard({ name: 'Quayside Driving School', cityName: 'Manchester', instructorCount: 2, hourlyFromPence: 4000, logoUrl: null })).toEqual({
      eyebrow: 'Driving school in Manchester',
      title: 'Quayside Driving School',
      facts: ['2 instructors', 'From £40 an hour'],
      picture: { initials: 'QS', photoUrl: null, verified: false },
      action: 'Choose an instructor',
      paused: false,
    });
    expect(schoolShareCard({ name: 'Northern Lights', cityName: null, instructorCount: 1, hourlyFromPence: null, logoUrl: null })).toMatchObject({
      eyebrow: 'Driving school',
      facts: ['1 instructor'],
    });
    expect(schoolShareCard({ name: 'Empty', cityName: null, instructorCount: 0, hourlyFromPence: null, logoUrl: null }).facts).toEqual([]);
  });

  it('shows a place page by its heading and how many are listed there', () => {
    expect(placeShareCard({ citySlug: 'london', cityName: 'London', area: { slug: 'camden', name: 'Camden' }, instructorCount: 3 })).toEqual({
      eyebrow: 'London',
      title: 'Driving lessons in Camden, London',
      facts: ['3 instructors checked by us', 'Prices and free times'],
      picture: null,
      action: 'Find an instructor',
      paused: false,
    });
    expect(placeShareCard({ citySlug: 'leeds', cityName: 'Leeds', automatic: true, instructorCount: 1 }).facts).toEqual([
      '1 instructor checked by us',
      'Prices and free times',
    ]);
    expect(placeShareCard({ citySlug: 'leeds', cityName: 'Leeds', instructorCount: 0 }).facts).toEqual(['No instructors listed yet']);
  });

  it('shows the site itself by what it does and who it is for', () => {
    expect(siteShareCard('Book, pay and track driving lessons in one simple app.')).toEqual({
      eyebrow: 'Driving lessons, sorted',
      title: 'Book, pay and track driving lessons in one simple app.',
      facts: ['For learners', 'For instructors', 'For driving schools'],
      picture: null,
      action: 'Get started',
      paused: false,
    });
  });

  it('gives each card a version that changes with anything it draws, and only then', () => {
    const card = instructorShareCard(sarah);
    expect(shareCardVersion(card)).toMatch(/^[0-9a-z]{1,7}$/);
    expect(shareCardVersion(instructorShareCard({ ...sarah }))).toBe(shareCardVersion(card));
    const changed = [
      instructorShareCard({ ...sarah, name: 'Sarah Khan-Ali' }),
      instructorShareCard({ ...sarah, hourlyFromPence: 4300 }),
      instructorShareCard({ ...sarah, photoUrl: 'https://example.com/new.webp' }),
      instructorShareCard({ ...sarah, takingBookings: false }),
    ].map(shareCardVersion);
    expect(new Set([shareCardVersion(card), ...changed]).size).toBe(5);
  });
});
