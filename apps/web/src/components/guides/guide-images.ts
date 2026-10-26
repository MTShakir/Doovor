import type { GuideImageKey } from '@repo/core/guides';
import type { StaticImageData } from 'next/image';
import bookingLink from './images/driving-instructor-booking-link-and-qr-code.webp';
import bookkeeping from './images/driving-instructor-bookkeeping.webp';
import diaryWeek from './images/driving-instructor-diary-week-view.webp';
import expenses from './images/driving-instructor-expenses-with-receipts.webp';
import money from './images/driving-instructor-payments-tax-year.webp';
import publicProfile from './images/driving-instructor-profile-checked-badge.webp';
import taxYearExport from './images/driving-instructor-tax-year-export.webp';
import today from './images/driving-instructor-app-today-screen.webp';
import lessonRecord from './images/driving-lesson-record-skills.webp';
import bookingPage from './images/learner-books-driving-lesson-online.webp';
import learnerContact from './images/learner-contacts-driving-instructor.webp';
import learnerLessons from './images/learner-driving-lessons-list.webp';
import learnerPay from './images/learner-pays-for-driving-lesson-by-card.webp';
import picardyRoad from './images/picardy-road-belvedere-steep-hill-sign.webp';
import sidcupHighStreet from './images/sidcup-high-street.webp';
import woolwichRoad from './images/woolwich-road-belvedere-a206.webp';

/**
 * The file behind each picture a guide can show (D-387): screens of the app on a phone, 640 pixels
 * wide, photographed from the local app with its made-up people and example figures, and three
 * photographs of Sidcup and Belvedere used under their licence as they are (D-391). The files are
 * named for what they show, which is the name search sees. A key with no file here fails the type
 * check, so a guide can never name a picture that is not drawn.
 */
export const guideImages: Record<GuideImageKey, StaticImageData> = {
  'booking-page': bookingPage,
  'booking-link': bookingLink,
  today,
  'diary-week': diaryWeek,
  'lesson-record': lessonRecord,
  money,
  'learner-pay': learnerPay,
  'learner-lessons': learnerLessons,
  'learner-contact': learnerContact,
  'public-profile': publicProfile,
  'tax-year-export': taxYearExport,
  expenses,
  bookkeeping,
  'sidcup-high-street': sidcupHighStreet,
  'woolwich-road-belvedere': woolwichRoad,
  'picardy-road-belvedere': picardyRoad,
};
