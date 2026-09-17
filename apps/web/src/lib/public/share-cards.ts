import { hourlyFromPence } from '@repo/core/public-profile';
import { instructorShareCard, placeShareCard, schoolShareCard, type ShareCard } from '@repo/core/share-card';
import { avatarUrl } from '@/lib/storage/images';
import type { CityPage } from './city-page';
import type { InstructorProfilePage } from './instructor-profile';
import type { SchoolProfilePage } from './school-profile';

/**
 * Each public page's share card (PRD 14.6, M5-08), from the same read the page makes. The page's
 * metadata and its image route both build the card here, so the version in the image's address
 * is the version the route draws.
 */

export function instructorCard(profile: InstructorProfilePage): ShareCard {
  return instructorShareCard({
    name: profile.name,
    qualification: profile.qualification,
    transmission: profile.transmission,
    cityName: profile.place?.cityName ?? null,
    hourlyFromPence: hourlyFromPence(profile.lessons),
    takingBookings: profile.takingBookings,
    photoUrl: avatarUrl(profile.photoPath) ?? null,
  });
}

export function schoolCard(school: SchoolProfilePage): ShareCard {
  return schoolShareCard({
    name: school.name,
    cityName: school.place?.cityName ?? null,
    instructorCount: school.instructors.length,
    hourlyFromPence: hourlyFromPence(school.lessons),
    logoUrl: avatarUrl(school.logoPath) ?? null,
  });
}

export function placeCard(page: CityPage, automatic: boolean): ShareCard {
  return placeShareCard({
    citySlug: page.city.slug,
    cityName: page.city.name,
    area: page.area,
    automatic,
    instructorCount: page.instructors.length,
  });
}
